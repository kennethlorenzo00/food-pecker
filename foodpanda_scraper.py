from seleniumbase import SB
import requests
from selectolax.parser import HTMLParser
import json
from rich import print
import os, sys
import pandas as pd
import time

root_path = os.path.dirname(os.path.abspath(__file__))
os.chdir(root_path)
csv_file = os.path.join(root_path, "data", "data.csv")


cities = ['quezon-city']

def handle_captcha(sb):
    try:
        sb.uc_gui_click_captcha()
        time.sleep(5)
    except Exception as e:
        print(f"Error handling captcha: {e}")


while True:
    for city in cities:
        url = f"https://www.foodpanda.ph/city/{city}?page=1"

        restaurant_data = []
        with SB(uc=True, test=True) as sb:
            sb.open(url)
            handle_captcha(sb)
            time.sleep(5)
            page_html = sb.get_page_source()

            tree = HTMLParser(page_html)
            for script in tree.css('script'):
                try:
                    json_data = json.loads(script.text())
                except json.JSONDecodeError:
                    continue
                
                if isinstance(json_data, dict) and json_data.get('@type') == 'ItemList':
                    for item in json_data.get('itemListElement', []):
                        restaurant = item.get('item', {})
                        restaurant_data.append({
                            'name': restaurant.get('name'),
                            'image': restaurant.get('image'),
                            'telephone': restaurant.get('telephone'),
                            'servesCuisine': restaurant.get('servesCuisine'),
                            'priceRange': restaurant.get('priceRange'),
                            'streetAddress': restaurant.get('streetAddress'),
                            'addressLocality': restaurant.get('addressLocality'),
                            'postalCode': restaurant.get('postalCode'),
                            'addressCountry': restaurant.get('addressCountry'),
                            'url': restaurant.get('url'),
                        })
        
        for restaurant_url in [item.get('url') for item in restaurant_data if item.get('url')]:
            print(f">=Foodpanda restaurant_url = {restaurant_url}")
            with SB(uc=True, test=True) as sb:
                sb.open(restaurant_url)
                handle_captcha(sb)
                time.sleep(5)
                sb.uc_open_with_reconnect(restaurant_url, 4)
                page_html = sb.get_page_source()
                tree = HTMLParser(page_html)

                for script in tree.css('script[data-testid="restaurant-seo-schema"]'):
                    try:
                        json_data = json.loads(script.text())
                    except json.JSONDecodeError:
                        continue
                    if not isinstance(json_data, dict):
                        continue
                        
                    def dget(obj, *keys, default=None):
                        for k in keys:
                            if isinstance(obj, list) and obj:
                                if isinstance(obj[0], dict):
                                    obj = obj[0].get(k)
                                else:
                                    return default
                            elif isinstance(obj, dict):
                                obj = obj.get(k)
                            else:
                                return default
                            
                            if obj is None:
                                return default
                        return obj if obj is not None else default

                    restaurant_info = {
                        "@type": dget(json_data, '@type', default=''),
                        "@id": dget(json_data, '@id'),
                        "name": dget(json_data, 'name'),
                        "addressCountry": dget(json_data, 'address', 'addressCountry'),
                        "streetAddress": dget(json_data, 'address', 'streetAddress'),
                        "addressLocality": dget(json_data, 'address', 'addressLocality'),
                        "postalCode": dget(json_data, 'address', 'postalCode'),
                        "geo__latitude": dget(json_data, 'geo', 'latitude'),
                        "geo__longitude": dget(json_data, 'geo', 'longitude'),
                        "geoMidpoint__latitude": dget(json_data, 'areaServed', 'geoMidpoint', 'latitude'),
                        "geoMidpoint__longitude": dget(json_data, 'areaServed', 'geoMidpoint', 'longitude'),
                        "geoRadius": dget(json_data, 'areaServed', 'geoRadius'),
                        "url": dget(json_data, 'url', default=''),
                        "menu": dget(json_data, 'menu', 'url', default=''),
                        "ratingValue": dget(json_data, 'aggregateRating', 'ratingValue'),
                        "reviewCount": dget(json_data, 'aggregateRating', 'reviewCount'),
                        "openingHoursSpecification__dayOfWeek": dget(json_data, 'openingHoursSpecification', 'dayOfWeek'),
                        "image": dget(json_data, 'image', default=[]),
                        "servesCuisine__": dget(json_data, 'servesCuisine', default=[]),
                        "priceRange": dget(json_data, 'priceRange', default=''),
                        "MenuCategory": '',
                        'Description': '',
                        "Product Name": '',
                        "Price (Starting From)": '',
                    }
                    print(restaurant_info)

                    df = pd.DataFrame([restaurant_info])
                    os.makedirs(os.path.dirname(csv_file), exist_ok=True)
                    df.to_csv(csv_file, mode='a', index=False, header=not os.path.exists(csv_file))

    print('Scraped')

    print("Finished scraping all cities.")
    break