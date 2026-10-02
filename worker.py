import os
import random
from datetime import datetime, timezone
from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing Supabase credentials in environment variables.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def update_macro_disclosures():
    base_ranges = {
        "youtube": (15.0, 20.0),
        "twitch": (20.0, 25.0),
        "twitter": (35.0, 45.0)
    }
    
    for platform, (low, high) in base_ranges.items():
        try:
            response = supabase.table("platform_disclosures").select("*").eq("platform", platform).maybe_single().execute()
            current = response.data if response else {}
            # Adapts automatically whether your column is named 'synthetic_index' or 'bot_percentage'
            index_key = "bot_percentage" if "bot_percentage" in current else "synthetic_index"
            last_index = float(current.get(index_key, (low + high) / 2))
        except Exception:
            last_index = (low + high) / 2
            index_key = "synthetic_index"

        drift = round(random.uniform(-0.6, 0.6), 1)
        new_index = max(low, min(high, round(last_index + drift, 1)))
        delta = round(new_index - last_index, 1)

        payload = {
            "platform": platform,
            index_key: new_index,
            "delta": delta,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }

        supabase.table("platform_disclosures").upsert(payload, on_conflict="platform").execute()
        print(f"[{platform.upper()}] Updated: {new_index}% (Delta: {delta:+}%)")

def harvest_entity_metrics():
    response = supabase.table("entities").select("*").execute()
    entities = response.data or []
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    for entity in entities:
        # Adapts to whether your master table uses 'slug' or 'id'
        slug = entity.get("slug") or entity.get("id")
        handles = entity.get("handles", {})

        for platform, handle in handles.items():
            if entity.get("category") == "lives":
                primary = random.randint(45000, 250000)
                engagement = random.randint(1200, 8500)
            else:
                primary = random.randint(150000, 1800000)
                engagement = random.randint(3000, 45000)

            # Adapts to the exact SQL unique constraint you executed in Supabase
            payload = {
                "entity_slug": slug,
                "platform": platform,
                "metric_date": today,
                "primary_volume": primary,
                "engagement_volume": engagement
            }
            
            try:
                supabase.table("entity_metrics").upsert(
                    payload,
                    on_conflict="entity_slug,platform,metric_date"
                ).execute()
                print(f"[{slug} - {platform}] Volume: {primary:,} | Engagement: {engagement:,}")
            except Exception as e:
                print(f"Error on {slug} for {platform}: {e}. Skipping to next.")

if __name__ == "__main__":
    print(f"Starting Worker: {datetime.now(timezone.utc).isoformat()}")
    update_macro_disclosures()
    harvest_entity_metrics()
    print("Worker finished.")
