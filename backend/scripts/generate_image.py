#!/usr/bin/env python3
"""
WMTS layer downloader + stitcher (works with NASA Trek).

Features
- Parses GetCapabilities to discover Style, TileMatrixSet, TileMatrix.
- Uses ResourceURL template when available (REST), otherwise falls back to KVP.
- Concurrent tile downloads with retry/backoff.
- Optional tile subrange (--tile-range colMin:colMax,rowMin:rowMax).
- Stitches to one image (PNG or JPG). Missing tiles are filled.

Requirements: requests, Pillow, tqdm
  pip install requests pillow tqdm
"""

import argparse
import concurrent.futures as futures
import math
import os
import re
import sys
import tempfile
import time
import urllib.parse
import xml.etree.ElementTree as ET
from io import BytesIO

import requests
from PIL import Image
from tqdm import tqdm

NS = {
    "wmts": "http://www.opengis.net/wmts/1.0",
    "ows": "http://www.opengis.net/ows/1.1",
    "xlink": "http://www.w3.org/1999/xlink"
}

def fetch_text(url, timeout=30):
    r = requests.get(url, timeout=timeout)
    r.raise_for_status()
    return r.text

def parse_capabilities(xml_text):
    root = ET.fromstring(xml_text)
    return root

def find_layer(root, layer_id=None):
    layers = []
    for lyr in root.findall(".//wmts:Contents/wmts:Layer", NS):
        ident = lyr.findtext("ows:Identifier", default="", namespaces=NS)
        layers.append((ident, lyr))
    if not layers:
        raise RuntimeError("No layers found in capabilities.")
    if layer_id:
        for ident, node in layers:
            if ident == layer_id:
                return ident, node
        raise RuntimeError(f"Layer '{layer_id}' not found. Available: {', '.join(i for i,_ in layers[:20])} ...")
    # fallback: first layer
    return layers[0]

def layer_formats(layer_node):
    return [fmt.text for fmt in layer_node.findall("wmts:Format", NS)]

def layer_default_style(layer_node):
    for s in layer_node.findall("wmts:Style", NS):
        ident = s.findtext("ows:Identifier", namespaces=NS)
        is_default = (s.attrib.get("isDefault", "").lower() == "true")
        if is_default:
            return ident
    # fallback: first style
    s = layer_node.find("wmts:Style/ows:Identifier", NS)
    return s.text if s is not None else "default"

def layer_tilematrixset_id(layer_node):
    tms = layer_node.find("wmts:TileMatrixSetLink/wmts:TileMatrixSet", NS)
    if tms is None or not tms.text:
        raise RuntimeError("Layer has no TileMatrixSetLink/TileMatrixSet.")
    return tms.text.strip()

def find_tilematrixset(root, tms_id):
    for node in root.findall(".//wmts:Contents/wmts:TileMatrixSet", NS):
        ident = node.findtext("ows:Identifier", namespaces=NS)
        if ident == tms_id:
            return node
    raise RuntimeError(f"TileMatrixSet '{tms_id}' not found.")

def list_tilematrices(tms_node):
    def to_int_like(text):
        # Handles "256", "256.0", "2.0" safely
        return int(float(text.strip()))
    lst = []
    for tm in tms_node.findall("wmts:TileMatrix", NS):
        ident = tm.findtext("ows:Identifier", namespaces=NS)
        tile_w = to_int_like(tm.findtext("wmts:TileWidth", namespaces=NS))
        tile_h = to_int_like(tm.findtext("wmts:TileHeight", namespaces=NS))
        m_w = to_int_like(tm.findtext("wmts:MatrixWidth", namespaces=NS))
        m_h = to_int_like(tm.findtext("wmts:MatrixHeight", namespaces=NS))
        lst.append({
            "id": ident,                   # keep as string (some servers use "2.0")
            "tile_width": tile_w,
            "tile_height": tile_h,
            "matrix_width": m_w,
            "matrix_height": m_h
        })
    return lst

def resourceurl_template(layer_node):
    """
    Prefer REST 'ResourceURL' for tiles, if present.
    Example attributes:
      resourceType="tile"
      format="image/jpeg"
      template="https://.../{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg"
    """
    for rurl in layer_node.findall("wmts:ResourceURL", NS):
        if rurl.attrib.get("resourceType") == "tile" and "template" in rurl.attrib:
            return rurl.attrib["template"], rurl.attrib.get("format")
    return None, None

def make_kvp_url(base_service_url, layer_id, style, tms_id, tilematrix, row, col, out_format):
    # Ensure base is a service endpoint (no prior query)
    parsed = urllib.parse.urlparse(base_service_url)
    if parsed.query:
        # strip query
        base = urllib.parse.urlunparse(parsed._replace(query=""))
    else:
        base = base_service_url
    params = {
        "SERVICE": "WMTS",
        "VERSION": "1.0.0",
        "REQUEST": "GetTile",
        "LAYER": layer_id,
        "STYLE": style,
        "TILEMATRIXSET": tms_id,
        "TILEMATRIX": tilematrix,
        "TILEROW": str(row),
        "TILECOL": str(col),
        "FORMAT": out_format or "image/png",
    }
    return base + ("?" + urllib.parse.urlencode(params))

VAR_RE = re.compile(r"\{([A-Za-z0-9]+)\}")

def render_rest_template(template, mapping):
    def repl(m):
        key = m.group(1)
        return str(mapping.get(key, m.group(0)))
    return VAR_RE.sub(repl, template)

def detect_base_service_url(capabilities_url):
    # For KVP fallback: replace 'WMTSCapabilities.xml' with 'WMTS' base or keep base path
    # We’ll just return the directory of the capabilities file.
    parsed = urllib.parse.urlparse(capabilities_url)
    base = parsed._replace(path=os.path.dirname(parsed.path) + "/WMTS", query="", params="", fragment="")
    return urllib.parse.urlunparse(base)

def ext_from_format(fmt):
    # map MIME to extension
    if not fmt:
        return "png"
    fmt = fmt.lower()
    if "png" in fmt:
        return "png"
    if "jpeg" in fmt or "jpg" in fmt:
        return "jpg"
    if "webp" in fmt:
        return "webp"
    return "png"

def main():
    ap = argparse.ArgumentParser(description="Download + stitch a WMTS layer (NASA Trek friendly).")
    ap.add_argument("--capabilities", required=True, help="URL to WMTSCapabilities.xml")
    ap.add_argument("--layer", required=False, help="Layer identifier (if omitted, the first layer is used)")
    ap.add_argument("--style", required=False, help="Style identifier (default: the layer's default style)")
    ap.add_argument("--tms", dest="tms_id", required=False, help="TileMatrixSet identifier (default: from layer)")
    ap.add_argument("--zoom", required=True, help="TileMatrix identifier to download (string, e.g., '0','5','14')")
    ap.add_argument("--tile-range", default=None,
                    help="Optional tile range: colMin:colMax,rowMin:rowMax (inclusive). Example: 0:63,0:31")
    ap.add_argument("--out", required=True, help="Output image path (.png or .jpg)")
    ap.add_argument("--max-workers", type=int, default=8, help="Concurrent downloads (default 8)")
    ap.add_argument("--retries", type=int, default=3, help="Retries per tile (default 3)")
    ap.add_argument("--delay", type=float, default=0.0, help="Delay seconds between requests (politeness)")
    ap.add_argument("--user-agent", default="wmts-stitcher/1.0", help="HTTP User-Agent")
    args = ap.parse_args()
    
    print(f"Starting WMTS download...")
    print(f"Capabilities URL: {args.capabilities}")
    print(f"Layer: {args.layer}")
    print(f"Zoom: {args.zoom}")
    print(f"Output: {args.out}")

    # Get capabilities
    print("Fetching capabilities document...")
    caps_xml = fetch_text(args.capabilities)
    print(f"Capabilities document size: {len(caps_xml)} characters")
    root = parse_capabilities(caps_xml)
    print("Capabilities document parsed successfully")

    # Resolve layer & style
    print("Finding layer...")
    layer_id, layer_node = find_layer(root, args.layer)
    print(f"Found layer: {layer_id}")
    style = args.style or layer_default_style(layer_node)
    print(f"Using style: {style}")

    # Resolve TileMatrixSet
    print("Resolving TileMatrixSet...")
    tms_id = args.tms_id or layer_tilematrixset_id(layer_node)
    print(f"Using TileMatrixSet: {tms_id}")
    tms_node = find_tilematrixset(root, tms_id)
    matrices = list_tilematrices(tms_node)
    print(f"Found {len(matrices)} tile matrices")

    # Find chosen TileMatrix
    tm = next((m for m in matrices if m["id"] == args.zoom), None)
    if tm is None:
        raise RuntimeError(f"TileMatrix '{args.zoom}' not found. Available IDs: {', '.join(m['id'] for m in matrices)}")

    tile_w = tm["tile_width"]
    tile_h = tm["tile_height"]
    mat_w = tm["matrix_width"]
    mat_h = tm["matrix_height"]

    # Determine REST template or fallback KVP
    rest_template, rest_format = resourceurl_template(layer_node)
    tile_format_from_layer = None
    fmts = layer_formats(layer_node)
    if fmts:
        tile_format_from_layer = fmts[0]  # first advertised format
    out_mime = rest_format or tile_format_from_layer or "image/png"
    out_ext = ext_from_format(out_mime)

    # If output path lacks extension, add one based on format
    out_path = args.out
    if not os.path.splitext(out_path)[1]:
        out_path = out_path + f".{out_ext}"

    # Build URL generator
    headers = {"User-Agent": args.user_agent}
    base_service = detect_base_service_url(args.capabilities)

    def tile_url(col, row):
        if rest_template:
            mapping = {
                "Style": style,
                "TileMatrixSet": tms_id,
                "TileMatrix": args.zoom,
                "TileRow": row,
                "TileCol": col,
                # Some templates also include Layer or layer in the path:
                "Layer": layer_id,
                "layer": layer_id,
            }
            return render_rest_template(rest_template, mapping)
        else:
            return make_kvp_url(base_service, layer_id, style, tms_id, args.zoom, row, col, out_mime)

    # Parse optional tile range
    col_min, col_max = 0, mat_w - 1
    row_min, row_max = 0, mat_h - 1
    if args.tile_range:
        try:
            part_cols, part_rows = args.tile_range.split(",")
            cmin, cmax = part_cols.split(":")
            rmin, rmax = part_rows.split(":")
            col_min = max(0, int(cmin))
            col_max = min(mat_w - 1, int(cmax))
            row_min = max(0, int(rmin))
            row_max = min(mat_h - 1, int(rmax))
        except Exception as e:
            raise RuntimeError(f"Invalid --tile-range. Expected colMin:colMax,rowMin:rowMax. Got: {args.tile_range}") from e

    # Make temp cache dir
    cache = tempfile.mkdtemp(prefix="wmts_tiles_")

    session = requests.Session()
    session.headers.update(headers)
    timeout = 60

    def fetch_tile(col, row):
        url = tile_url(col, row)
        attempt = 0
        while attempt < args.retries:
            try:
                if args.delay > 0:
                    time.sleep(args.delay)
                r = session.get(url, timeout=timeout)
                if r.status_code == 200:
                    return r.content
                elif r.status_code in (404, 204):
                    return None  # missing tile
                else:
                    attempt += 1
                    time.sleep(0.5 * (attempt ** 2))
            except requests.RequestException:
                attempt += 1
                time.sleep(0.5 * (attempt ** 2))
        return None

    # Prepare canvas
    cols = col_max - col_min + 1
    rows = row_max - row_min + 1
    canvas_w = cols * tile_w
    canvas_h = rows * tile_h
    # Use RGBA so we can fill holes nicely
    mosaic = Image.new("RGBA", (canvas_w, canvas_h), (240, 240, 240, 255))

    # Download concurrently
    tasks = []
    for r in range(row_min, row_max + 1):
        for c in range(col_min, col_max + 1):
            tasks.append((c, r))

    with futures.ThreadPoolExecutor(max_workers=args.max_workers) as executor:
        pbar = tqdm(total=len(tasks), desc="Downloading tiles", unit="tile")
        future_map = {executor.submit(fetch_tile, c, r): (c, r) for (c, r) in tasks}
        for fut in futures.as_completed(future_map):
            c, r = future_map[fut]
            content = fut.result()
            if content:
                try:
                    img = Image.open(BytesIO(content)).convert("RGBA")
                except Exception:
                    # Bad content; leave as fill
                    img = None
                if img:
                    x = (c - col_min) * tile_w
                    y = (r - row_min) * tile_h
                    mosaic.paste(img, (x, y))
            # else: missing -> leave fill
            pbar.update(1)
        pbar.close()

    # Convert to output mode based on extension
    ext = os.path.splitext(out_path)[1].lower()
    if ext in (".jpg", ".jpeg"):
        # flatten RGBA onto white for JPEG
        out_img = Image.new("RGB", (canvas_w, canvas_h), (255, 255, 255))
        out_img.paste(mosaic, mask=mosaic.split()[-1])
        out_img.save(out_path, quality=92, optimize=True)
    else:
        mosaic.save(out_path)

    print(f"Saved mosaic: {out_path}")
    print(f"Layer={layer_id}, Style={style}, TMS={tms_id}, TileMatrix={args.zoom}, Tiles={len(tasks)}")
    print(f"Canvas: {canvas_w} x {canvas_h}px ({cols} x {rows} tiles of {tile_w}x{tile_h})")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("ERROR:", e, file=sys.stderr)
        sys.exit(1)


        