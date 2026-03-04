import json
import time
import re
import requests
from playwright.sync_api import sync_playwright

# ── CONFIG ────────────────────────────────────────────────────────────────────
# Default: Quezon City, Metro Manila — change to your target area
LATITUDE  = 14.6760
LONGITUDE = 121.0437
RESTAURANT_LIMIT = 50

BASE_URL  = "https://food.grab.com"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://food.grab.com/ph/en/restaurants",
    "Origin": "https://food.grab.com",
}

# ── STEP 1: Fetch restaurant list via GrabFood internal API ───────────────────
def fetch_restaurants(lat, lng, limit=50):
    """
    Hit GrabFood's merchant search API with lat/lng.
    Returns list of dicts: { name, url, cuisine, rating, estimated_delivery_time }
    """
    print(f"[*] Fetching restaurants near ({lat}, {lng}) ...")

    # GrabFood uses this search endpoint — paged in batches of 32
    api_url = "https://food.grab.com/foodweb/v2/search"
    restaurants = []
    offset = 0
    batch  = 32

    while len(restaurants) < limit:
        payload = {
            "latlng": f"{lat},{lng}",
            "keyword": "",
            "offset": offset,
            "pageSize": batch,
            "countryCode": "PH",
        }
        try:
            resp = requests.get(api_url, params=payload, headers=HEADERS, timeout=15)
            print(f"  [API] {resp.status_code} — offset {offset}")
            if resp.status_code != 200:
                print(f"  [!] Non-200 response, trying Playwright intercept fallback...")
                return None  # signal to use Playwright fallback

            data = resp.json()

            # Navigate common response shapes
            merchants = (
                data.get("searchResult", {}).get("searchMerchants")
                or data.get("merchants")
                or data.get("data", {}).get("merchants")
                or []
            )

            if not merchants:
                print(f"  [!] No merchants in response at offset {offset}. Keys: {list(data.keys())}")
                break

            for m in merchants:
                info = m.get("merchantBrief", m)  # some responses nest inside merchantBrief
                merchant_id  = m.get("id", "")
                path         = m.get("path", "")
                name         = info.get("name", m.get("name", ""))
                cuisine_tags = info.get("cuisine", info.get("cuisines", []))
                cuisine      = ", ".join(cuisine_tags) if isinstance(cuisine_tags, list) else str(cuisine_tags)
                rating       = info.get("rating", info.get("ratingCount", ""))
                est_time     = info.get("estimatedDeliveryTime", info.get("deliveryTime", ""))

                if path:
                    url = f"/ph/en/restaurant/{path}" if not path.startswith("/") else path
                elif merchant_id:
                    url = f"/ph/en/restaurant/{merchant_id}"
                else:
                    url = ""

                if name:
                    restaurants.append({
                        "name": name,
                        "url": url,
                        "cuisine": cuisine,
                        "rating": str(rating),
                        "estimated_delivery_time": str(est_time),
                    })

            print(f"  Collected {len(restaurants)} restaurants so far")
            if len(merchants) < batch:
                break  # no more pages
            offset += batch

        except Exception as e:
            print(f"  [!] API request error: {e}")
            return None

    return restaurants[:limit]


# ── STEP 2: Playwright fallback — intercept the API call the browser makes ────
def fetch_restaurants_via_playwright(lat, lng, limit=50):
    """
    Open GrabFood in a browser with a spoofed location,
    intercept the XHR/fetch calls, and extract restaurant list.
    """
    print("[*] Using Playwright to intercept restaurant API...")
    restaurants = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=HEADERS["User-Agent"],
            viewport={"width": 1280, "height": 900},
            geolocation={"latitude": lat, "longitude": lng},
            permissions=["geolocation"],
        )

        captured = []

        def on_response(response):
            url = response.url
            if response.status == 200 and ("search" in url or "merchant" in url or "restaurant" in url):
                try:
                    ct = response.headers.get("content-type", "")
                    if "json" in ct:
                        data = response.json()
                        captured.append({"url": url, "data": data})
                        print(f"  [intercept] {url[:100]}")
                except Exception:
                    pass

        page = context.new_page()
        page.on("response", on_response)

        target = (
            f"https://food.grab.com/ph/en/restaurants"
            f"#{{'lat': {lat}, 'lng': {lng}}}'"
        )
        # Navigate with lat/lng hash — GrabFood reads window.location.hash
        page.goto(
            f"https://food.grab.com/ph/en/restaurants",
            timeout=30000,
            wait_until="domcontentloaded",
        )
        time.sleep(4)

        # Inject coordinates into the page so GrabFood picks them up
        page.evaluate(f"""
            () => {{
                if (window.grab && window.grab.setLocation) {{
                    window.grab.setLocation({lat}, {lng});
                }}
                // Dispatch a custom event some SPAs listen for
                window.dispatchEvent(new CustomEvent('locationChanged', {{
                    detail: {{ lat: {lat}, lng: {lng} }}
                }}));
            }}
        """)
        time.sleep(3)

        # Scroll to trigger lazy loads
        for _ in range(6):
            page.evaluate("window.scrollBy(0, 600)")
            time.sleep(1.5)

        # Parse intercepted API responses
        for entry in captured:
            data = entry["data"]
            for key in ["searchMerchants", "merchants", "data", "results", "items"]:
                candidates = data.get(key) or (data.get("searchResult") or {}).get(key, [])
                if isinstance(candidates, list) and candidates:
                    for m in candidates:
                        info = m.get("merchantBrief", m)
                        name = info.get("name", m.get("name", ""))
                        path = m.get("path", "")
                        mid  = m.get("id", "")
                        url  = f"/ph/en/restaurant/{path}" if path else (f"/ph/en/restaurant/{mid}" if mid else "")
                        if name:
                            restaurants.append({
                                "name": name,
                                "url": url,
                                "cuisine": str(info.get("cuisine", "")),
                                "rating": str(info.get("rating", "")),
                                "estimated_delivery_time": str(info.get("estimatedDeliveryTime", "")),
                            })

        # If still nothing, fall back to DOM scraping direct restaurant links
        if not restaurants:
            print("  [!] No API data captured — scraping DOM links...")
            links = page.query_selector_all('a[href*="/restaurant/"]')
            for link in links[:limit]:
                href = link.get_attribute("href") or ""
                text = link.inner_text().strip()
                if text and len(text) > 2:
                    restaurants.append({"name": text, "url": href, "cuisine": "", "rating": "", "estimated_delivery_time": ""})

        page.screenshot(path="grabfood_screenshot.png", full_page=False)
        print("[*] Screenshot saved -> grabfood_screenshot.png")

        browser.close()

    # Deduplicate
    seen, unique = set(), []
    for r in restaurants:
        key = r["name"].lower().strip()
        if key and key not in seen:
            seen.add(key)
            unique.append(r)

    return unique[:limit]


# ── STEP 3: Scrape an individual restaurant's menu page ───────────────────────
def scrape_menu_page(context, restaurant_url):
    full_url = restaurant_url if restaurant_url.startswith("http") else BASE_URL + restaurant_url
    menu_items = []

    page = context.new_page()
    try:
        print(f"    -> {full_url[:90]}")
        try:
            page.goto(full_url, timeout=30000, wait_until="domcontentloaded")
        except Exception as e:
            print(f"    [!] Nav warning: {e}")

        time.sleep(5)

        for _ in range(5):
            page.evaluate("window.scrollBy(0, 700)")
            time.sleep(1.2)

        # Strategy 1: menu item selectors
        item_selectors = [
            '[data-testid="menu-item"]',
            '[class*="menuItem"]',
            '[class*="MenuItem"]',
            '[class*="menu-item"]',
            '[class*="dish-card"]',
            '[class*="DishCard"]',
            '[class*="item-card"]',
            '[class*="ItemCard"]',
            '[class*="FoodItem"]',
            '[class*="food-item"]',
        ]
        items_found = []
        for sel in item_selectors:
            items_found = page.query_selector_all(sel)
            if items_found:
                print(f"    Matched {len(items_found)} items via '{sel}'")
                break

        for item in items_found:
            try:
                name_el  = item.query_selector('[class*="name"i], [class*="title"i], h3, h4, strong')
                price_el = item.query_selector('[class*="price"i], [class*="cost"i], [class*="amount"i]')
                desc_el  = item.query_selector('[class*="desc"i], [class*="description"i], p')

                name  = name_el.inner_text().strip()  if name_el  else None
                price = price_el.inner_text().strip() if price_el else None
                desc  = desc_el.inner_text().strip()  if desc_el  else None

                if name:
                    menu_items.append({
                        "name": name,
                        "price": price,
                        "description": desc if desc and desc != name else None,
                    })
            except Exception:
                pass

        # Strategy 2: JSON-LD structured data
        if not menu_items:
            html = page.content()
            matches = re.findall(r'<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>', html, re.DOTALL)
            for match in matches:
                try:
                    data = json.loads(match)
                    if isinstance(data, dict) and data.get("@type") == "Restaurant":
                        for section in (data.get("hasMenu", {}).get("hasMenuSection") or []):
                            for entry in (section.get("hasMenuItem") or []):
                                menu_items.append({
                                    "name": entry.get("name"),
                                    "price": str(entry.get("offers", {}).get("price", "")),
                                    "description": entry.get("description"),
                                })
                except Exception:
                    pass

        # Strategy 3: broad food/product class fallback
        if not menu_items:
            blocks = page.query_selector_all('[class*="food"i], [class*="product"i]')
            for block in blocks[:80]:
                try:
                    text  = block.inner_text().strip()
                    lines = [l.strip() for l in text.split("\n") if l.strip()]
                    if lines:
                        name  = lines[0]
                        price = next((l for l in lines if re.search(r'[₱$]|\d+\.\d{2}', l)), None)
                        desc  = lines[1] if len(lines) > 1 and lines[1] != price else None
                        if name and len(name) > 2:
                            menu_items.append({"name": name, "price": price, "description": desc})
                except Exception:
                    pass

    finally:
        page.close()

    # Deduplicate
    seen, unique = set(), []
    for item in menu_items:
        key = (item.get("name") or "").lower()
        if key and key not in seen:
            seen.add(key)
            unique.append(item)

    return unique


# ── MAIN ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("  GrabFood Scraper  —  GPS-based")
    print(f"  Location : {LATITUDE}, {LONGITUDE}")
    print(f"  Target   : {RESTAURANT_LIMIT} restaurants")
    print("=" * 60)

    # Step 1: get restaurant list
    restaurants = fetch_restaurants(LATITUDE, LONGITUDE, RESTAURANT_LIMIT)

    if not restaurants:
        print("[*] Direct API failed — switching to Playwright intercept...")
        restaurants = fetch_restaurants_via_playwright(LATITUDE, LONGITUDE, RESTAURANT_LIMIT)

    print(f"\n[*] {len(restaurants)} restaurants ready for menu scraping\n")

    # Step 2: scrape each restaurant's menu
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=HEADERS["User-Agent"],
            viewport={"width": 1280, "height": 900},
        )

        enriched = []
        for idx, r in enumerate(restaurants):
            url  = r.get("url", "")
            name = r.get("name", "Unknown")

            if not url or "/restaurant/" not in url:
                print(f"[{idx+1}/{len(restaurants)}] Skip '{name}' — no direct page URL")
                enriched.append({**r, "menu": []})
                continue

            print(f"[{idx+1}/{len(restaurants)}] {name}")
            menu = scrape_menu_page(context, url)
            print(f"    => {len(menu)} menu items")

            enriched.append({**r, "menu": menu})

            # Print all menu items in terminal
            for item in menu:
                price = item.get("price") or "?"
                desc  = (item.get("description") or "")[:55]
                print(f"      • {item['name']}  [{price}]  {desc}")
            print()

            time.sleep(1.5)

        browser.close()

    # Step 3: save output
    output = {
        "location": {"latitude": LATITUDE, "longitude": LONGITUDE},
        "total_restaurants": len(enriched),
        "restaurants": enriched,
    }

    with open("grabfood_results.json", "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    # Summary
    with_menus = [r for r in enriched if r.get("menu")]
    total_items = sum(len(r["menu"]) for r in enriched)

    print("\n" + "=" * 60)
    print(f"  Saved -> grabfood_results.json")
    print(f"  Restaurants : {len(enriched)}")
    print(f"  With menus  : {len(with_menus)}")
    print(f"  Total items : {total_items}")
    print("=" * 60)

    print("\nSample output:")
    for r in enriched[:3]:
        print(f"\n  {r['name']} ({r.get('cuisine','')}) ★{r.get('rating','')}")
        for item in r.get("menu", [])[:3]:
            desc = (item.get("description") or "")[:50]
            print(f"    • {item['name']}  {item.get('price','?')}  {desc}")
