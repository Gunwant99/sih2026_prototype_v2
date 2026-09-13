import pandas as pd
from rapidfuzz import fuzz
from dataset_state import get_dataset


def clean_text(text):
    if pd.isna(text):
        return ""
    return str(text).lower().strip()


def description_quality(text):
    text = clean_text(text)
    if not text:
        return 0
    words = text.split()
    if len(words) <= 2:
        return 0.25
    if len(words) <= 5:
        return 0.50
    if len(words) <= 8:
        return 0.75
    return 1.0


def find_similar_projects(work_id, top_n=5):
    df = get_dataset()
    try:
        wid = int(work_id)
    except Exception:
        return []

    target_rows = df[df["Work ID"] == wid]
    if target_rows.empty:
        return []

    target = target_rows.iloc[0]
    target_description = clean_text(target.get("Work Description"))
    target_state = target.get("State")
    target_house = target.get("House")
    target_category = target.get("Category")
    target_constituency = target.get("Constituency")
    target_amount = float(target.get("Final Amount (₹)") or 0)

    candidates = df[
        (df["House"] == target_house) &
        (df["State"] == target_state) &
        (df["Category"] == target_category)
    ]

    results = []
    for _, row in candidates.iterrows():
        row_id = row.get("Work ID")
        if pd.isna(row_id) or int(row_id) == wid:
            continue

        description = clean_text(row.get("Work Description"))
        if not description or not target_description:
            continue

        text_similarity = fuzz.token_set_ratio(target_description, description)
        target_quality = description_quality(target_description)
        candidate_quality = description_quality(description)
        quality_factor = min(target_quality, candidate_quality)
        adjusted_text_similarity = text_similarity * quality_factor

        same_constituency = row.get("Constituency") == target_constituency

        score = adjusted_text_similarity * 0.60 + 30
        if same_constituency:
            score += 10

        row_amount = float(row.get("Final Amount (₹)") or 0)
        amount_difference_percent = (
            (abs(row_amount - target_amount) / target_amount) * 100 if target_amount > 0 else 0
        )

        results.append({
            "Work ID": int(row_id),
            "Similarity Score": round(score, 2),
            "Text Similarity": round(text_similarity, 2),
            "Adjusted Text Similarity": round(adjusted_text_similarity, 2),
            "Description Quality": round(candidate_quality, 2),
            "Same State": True,
            "Same House": True,
            "Same Category": True,
            "Same Constituency": same_constituency,
            "Amount Difference %": round(amount_difference_percent, 2),
            "Amount": row_amount,
            "Constituency": row.get("Constituency"),
            "State": row.get("State"),
            "House": row.get("House"),
            "Category": row.get("Category"),
            "Description": row.get("Work Description"),
        })

    results.sort(key=lambda x: x["Similarity Score"], reverse=True)
    return results[:top_n]