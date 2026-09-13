import pandas as pd
from similarity_engine import find_similar_projects
from dataset_state import get_dataset


# =========================================================
# TOOL 1 — GET PROJECT DETAILS
# =========================================================

def get_project_details(work_id: int):
    df = get_dataset()
    project = df[df["Work ID"] == work_id]

    if project.empty:
        return {
            "error": f"Project {work_id} not found"
        }

    row = project.iloc[0]

    return {
        "work_id": int(row["Work ID"]),
        "description": row.get("Work Description"),
        "category": row.get("Category"),
        "mp_name": row.get("MP Name"),
        "constituency": row.get("Constituency"),
        "state": row.get("State"),
        "house": row.get("House"),
        "amount": float(row.get("Final Amount (₹)") or 0),
        "has_images": bool(row.get("Has Images")),
        "risk_score": float(row.get("Risk_Score", row.get("risk_score", 0))),
        "risk_level": row.get("Risk_Level", row.get("risk_level", "LOW")),
        "risk_reasons": row.get("Risk_Reasons", row.get("risk_reasons", ""))
    }


# =========================================================
# TOOL 2 — SEARCH PROJECTS
# =========================================================

def search_projects(
    state=None,
    risk_level=None,
    min_amount=None,
    max_amount=None,
    has_images=None,
    limit=10
):
    results = get_dataset().copy()

    # Normalize risk column name if needed
    if "risk_level" not in results.columns and "Risk_Level" in results.columns:
        results["risk_level"] = results["Risk_Level"]
    if "risk_score" not in results.columns and "Risk_Score" in results.columns:
        results["risk_score"] = results["Risk_Score"]
    if "risk_reasons" not in results.columns and "Risk_Reasons" in results.columns:
        results["risk_reasons"] = results["Risk_Reasons"]

    if state:
        results = results[
            results["State"].astype(str).str.lower() == state.lower()
        ]

    if risk_level:
        results = results[
            results["risk_level"].astype(str).str.upper() == risk_level.upper()
        ]

    if min_amount is not None:
        results = results[
            results["Final Amount (₹)"] >= float(min_amount)
        ]

    if max_amount is not None:
        results = results[
            results["Final Amount (₹)"] <= float(max_amount)
        ]

    if has_images is not None:
        results = results[
            results["Has Images"] == bool(has_images)
        ]

    results = results.sort_values("risk_score", ascending=False).head(limit)

    projects = []
    for _, row in results.iterrows():
        projects.append({
            "work_id": int(row["Work ID"]),
            "description": row.get("Work Description"),
            "category": row.get("Category"),
            "mp_name": row.get("MP Name"),
            "constituency": row.get("Constituency"),
            "state": row.get("State"),
            "house": row.get("House"),
            "amount": float(row.get("Final Amount (₹)") or 0),
            "has_images": bool(row.get("Has Images")),
            "risk_score": float(row.get("risk_score", 0)),
            "risk_level": row.get("risk_level", "LOW"),
            "risk_reasons": row.get("risk_reasons", "")
        })

    return {
        "count": len(projects),
        "projects": projects
    }


# =========================================================
# TOOL 3 — COMPARE PROJECT WITH SIMILAR PROJECTS
# =========================================================

def compare_projects(work_id: int, limit: int = 5):
    df = get_dataset()
    target = df[df["Work ID"] == work_id]

    if target.empty:
        return {
            "error": f"Project {work_id} not found"
        }

    target_row = target.iloc[0]
    target_amount = float(target_row.get("Final Amount (₹)") or 0)
    target_score = float(target_row.get("Risk_Score", target_row.get("risk_score", 0)))
    target_level = target_row.get("Risk_Level", target_row.get("risk_level", "LOW"))

    similar_projects = find_similar_projects(work_id, limit)

    if not similar_projects:
        return {
            "target_project": {
                "work_id": work_id,
                "description": target_row.get("Work Description"),
                "category": target_row.get("Category"),
                "state": target_row.get("State"),
                "house": target_row.get("House"),
                "constituency": target_row.get("Constituency"),
                "amount": target_amount,
                "risk_score": target_score,
                "risk_level": target_level
            },
            "comparison_count": 0,
            "comparisons": []
        }

    comparisons = []
    for project in similar_projects:
        similar_id = int(project["Work ID"])
        comparison_amount = float(project["Amount"])
        amount_difference = target_amount - comparison_amount
        amount_diff_pct = (
            abs(amount_difference) / comparison_amount * 100
            if comparison_amount != 0 else None
        )

        comparisons.append({
            "work_id": similar_id,
            "description": project["Description"],
            "category": project["Category"],
            "state": project["State"],
            "house": project["House"],
            "constituency": project["Constituency"],
            "amount": comparison_amount,
            "target_amount": target_amount,
            "amount_difference": amount_difference,
            "amount_difference_percent": round(amount_diff_pct, 2) if amount_diff_pct is not None else None,
            "similarity_score": float(project["Similarity Score"]),
            "text_similarity": float(project["Text Similarity"]),
            "same_state": bool(project["Same State"]),
            "same_house": bool(project["Same House"]),
            "same_category": bool(project["Same Category"]),
            "same_constituency": bool(project["Same Constituency"])
        })

    return {
        "target_project": {
            "work_id": work_id,
            "description": target_row.get("Work Description"),
            "category": target_row.get("Category"),
            "state": target_row.get("State"),
            "house": target_row.get("House"),
            "constituency": target_row.get("Constituency"),
            "amount": target_amount,
            "risk_score": target_score,
            "risk_level": target_level
        },
        "comparison_count": len(comparisons),
        "comparisons": comparisons
    }