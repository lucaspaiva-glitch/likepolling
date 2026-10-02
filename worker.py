import os
import json
import urllib.parse
from datetime import datetime, timezone
import feedparser
from supabase import create_client, Client
import google.generativeai as genai

# 1. Initialize API Clients from GitHub Secrets
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
genai.configure(api_key=GEMINI_API_KEY)

# Stable active model
model = genai.GenerativeModel('gemini-1.5-flash')

def fetch_news_and_analyze(entity_name, query, category):
    """Fetches rolling 7-day RSS feed, calculates velocity, and prompts Gemini for intelligence."""
    print(f"[{entity_name}] Polling Google News RSS...")
    encoded_query = urllib.parse.quote(f"{query} when:7d")
    rss_url = f"https://news.google.com/rss/search?q={encoded_query}&hl=en-US&gl=US&ceid=US:en"
    
    feed = feedparser.parse(rss_url)
    articles = feed.entries
    press_velocity = len(articles)
    
    if press_velocity == 0:
        return {
            "sentiment_score": 50,
            "intelligence_note": "Insufficient media velocity over the trailing 7 days to calculate conviction.",
            "primary_volume": 0
        }

    headlines = [entry.title for entry in articles[:25]]
    headlines_text = "\n".join(f"- {h}" for h in headlines)

    bias_context = ""
    if category == "companies":
        bias_context = "Account for Enterprise Scrutiny Bias: standard corporate, earnings, and regulatory news is neutral baseline, not reputational crisis."
    elif category == "politicians":
        bias_context = "Account for Partisan Volatility: calibrate against standard polarized coverage; base score on governance momentum."

    prompt = f"""
    You are an institutional financial and geopolitical media analyst.
    Analyze these trailing 7-day headlines for '{entity_name}'.
    
    {bias_context}
    
    HEADLINES:
    {headlines_text}
    
    TASK:
    1. Output a Score (0-100). (Brand Approval Rating for companies, Media Favorability Rating for politicians).
    2. Write a 1-sentence executive Market Intelligence Note detailing the driving narrative and conviction level.
    
    Respond STRICTLY in valid JSON matching this schema:
    {{"sentiment_score": 82, "intelligence_note": "Executive summary text here."}}
    """

    try:
        response = model.generate_content(prompt)
        raw_json = response.text.replace("```json", "").replace("```", "").strip()
        analysis = json.loads(raw_json)
        analysis["primary_volume"] = press_velocity
        return analysis
    except Exception as e:
        print(f"[{entity_name}] Gemini analysis error: {e}")
        return {"sentiment_score": 50, "intelligence_note": "Automated sentiment synthesis error.", "primary_volume": press_velocity}

def main():
    print("--- STARTING LIKE POLLING INTELLIGENCE HARVESTER ---")
    
    response = supabase.table("entities").select("*").in_("category", ["companies", "politicians"]).execute()
    entities = response.data
    today_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    for entity in entities:
        handles = entity.get("handles", {})
        news_query = handles.get("news_query")
        
        if not news_query:
            print(f"[{entity['name']}] Skipping: No news_query defined.")
            continue
            
        analysis = fetch_news_and_analyze(entity['name'], news_query, entity['category'])
        
        metric_payload = {
            "entity_id": entity["id"],
            "platform": "google_news",
            "metric_date": today_date,
            "primary_volume": analysis["primary_volume"],
            "comment_volume": 0,
            "sentiment_score": analysis["sentiment_score"],
            "intelligence_note": analysis["intelligence_note"]
        }
        
        supabase.table("entity_metrics").insert(metric_payload).execute()
        print(f"[{entity['name']}] Inserted -> Velocity: {analysis['primary_volume']} | Rating: {analysis['sentiment_score']}%")
        print(f"    Note: {analysis['intelligence_note']}\n")
        
    print("--- HARVEST COMPLETE ---")

if __name__ == "__main__":
    main()
