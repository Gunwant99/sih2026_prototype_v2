from agent import investigate_with_agent, get_agent_trace
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException
import pandas as pd
from pathlib import Path
from database import init_db
from upload_routes import router as upload_router

from similarity_engine import find_similar_projects
from risk_engine_v4_optimized import parse_risk_breakdown
from dataset_state import get_dataset, reload_dataset

app = FastAPI(
    title="MPLADS AI Risk Investigator",
    description="AI-powered risk analysis and investigation assistant for MPLADS",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(upload_router)


@app.on_event("startup")
def _startup():
    init_db()
    reload_dataset()


def parse_bool(value):
    if pd.isna(value):
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    return str(value).strip().lower() in {
        "true", "1", "yes", "y", "available"
    }


def split_reasons(value):
    if pd.isna(value):
        return []
    return [x.strip() for x in str(value).split(" | ") if x.strip()]


def clean_value(value):
    if pd.isna(value):
        return None
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass
    return value


def v4_project(work_id):
    v4_df = get_dataset()
    project = v4_df[v4_df["Work ID"] == work_id]
    if project.empty:
        raise HTTPException(status_code=404, detail="Project not found")
    return project.iloc[0]


@app.get("/")
def root():
    v4_df = get_dataset()
    return {
        "message": "MPLADS AI Risk Investigator API is running",
        "version": "2.0.0",
        "v4_projects_loaded": len(v4_df),
    }


@app.get("/health")
def health():
    v4_df = get_dataset()
    return {
        "status": "healthy",
        "projects_loaded": len(v4_df),
        "v4_projects_loaded": len(v4_df),
        "v4_status": "ready",
    }


@app.get("/dashboard")
def dashboard():
    v4_df = get_dataset()
    risk_counts = (
        v4_df["Risk_Level"].fillna("LOW").astype(str).str.upper().value_counts()
    )

    total_projects = len(v4_df)
    low_count = int(risk_counts.get("LOW", 0))
    medium_count = int(risk_counts.get("MEDIUM", 0))
    high_count = int(risk_counts.get("HIGH", 0))

    total_amount = pd.to_numeric(
        v4_df["Final Amount (₹)"], errors="coerce"
    ).fillna(0).sum()

    projects_with_images = sum(parse_bool(v) for v in v4_df["Has Images"])
    projects_without_images = total_projects - projects_with_images

    queue = v4_df.sort_values(
        ["Risk_Score", "Final Amount (₹)"],
        ascending=[False, False]
    ).head(10)

    investigation_queue = []
    for _, row in queue.iterrows():
        investigation_queue.append({
            "work_id": clean_value(row.get("Work ID")),
            "description": clean_value(row.get("Work Description")),
            "state": clean_value(row.get("State")),
            "constituency": clean_value(row.get("Constituency")),
            "house": clean_value(row.get("House")),
            "category": clean_value(row.get("Category")),
            "amount": clean_value(row.get("Final Amount (₹)")),
            "risk_score": float(row.get("Risk_Score", 0)),
            "risk_level": str(row.get("Risk_Level", "LOW")).upper(),
            "risk_reasons": split_reasons(row.get("Risk_Reasons", "")),
        })

    state_counts = (
        v4_df["State"].fillna("Unknown").astype(str).value_counts().head(10)
    )

    state_distribution = [
        {"state": str(state), "projects": int(count)}
        for state, count in state_counts.items()
    ]

    v4_risk_counts = (
        v4_df["Risk_Level"].fillna("LOW").astype(str).str.upper().value_counts()
    )

    pending_projects = int(
        pd.to_numeric(v4_df.get("Pending_Payment_Count"), errors="coerce")
        .fillna(0).gt(0).sum()
    )
    missing_expenditure = int(
        v4_df["Financial_Reconciliation_Flag"]
        .fillna("")
        .eq("Expenditure record unavailable")
        .sum()
    )
    financial_mismatch = int(
        v4_df["Financial_Reconciliation_Flag"]
        .fillna("")
        .eq("Expenditure differs from final amount")
        .sum()
    )
    missing_sanction = int(
        v4_df["Timeline_Flag"]
        .fillna("")
        .eq("Sanction date unavailable")
        .sum()
    )

    return {
        "summary": {
            "total_projects": total_projects,
            "total_amount": float(total_amount),
            "low_risk": low_count,
            "medium_risk": medium_count,
            "high_risk": high_count,
            "projects_with_images": projects_with_images,
            "projects_without_images": projects_without_images,
        },
        "risk_distribution": [
            {"level": "LOW", "count": low_count},
            {"level": "MEDIUM", "count": medium_count},
            {"level": "HIGH", "count": high_count},
        ],
        "state_distribution": state_distribution,
        "investigation_queue": investigation_queue,
        "v4_lifecycle_summary": {
            "projects": len(v4_df),
            "low_priority": int(v4_risk_counts.get("LOW", 0)),
            "medium_priority": int(v4_risk_counts.get("MEDIUM", 0)),
            "high_priority": int(v4_risk_counts.get("HIGH", 0)),
            "pending_payment_projects": pending_projects,
            "missing_expenditure_records": missing_expenditure,
            "financial_mismatch_projects": financial_mismatch,
            "missing_sanction_dates": missing_sanction,
        },
    }


_CONCENTRATION_DIMENSIONS = {
    "mp": "MP Name",
    "constituency": "Constituency",
    "category": "Category",
    "state": "State",
}


@app.get("/analytics/concentration")
def concentration_analysis(dimension: str = "mp", min_count: int = 5, limit: int = 25):
    dimension = dimension.strip().lower()
    if dimension not in _CONCENTRATION_DIMENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"dimension must be one of: {', '.join(_CONCENTRATION_DIMENSIONS)}"
        )

    column = _CONCENTRATION_DIMENSIONS[dimension]
    min_count = max(1, min_count)
    limit = max(1, min(limit, 100))

    working = get_dataset().copy()
    working[column] = working[column].fillna("Unknown").astype(str).str.strip()
    working["_is_high"] = working["Risk_Level"].fillna("LOW").astype(str).str.upper().eq("HIGH")
    working["_amount"] = pd.to_numeric(working["Final Amount (₹)"], errors="coerce").fillna(0)

    total_projects = len(working)
    national_high_count = int(working["_is_high"].sum())
    national_rate = round((national_high_count / total_projects) * 100, 2) if total_projects else 0.0

    grouped = working.groupby(column).agg(
        total_projects=("_is_high", "count"),
        high_risk_count=("_is_high", "sum"),
        flagged_amount=("_amount", lambda s: float(s[working.loc[s.index, "_is_high"]].sum())),
        total_amount=("_amount", "sum"),
    ).reset_index()

    grouped = grouped[grouped["total_projects"] >= min_count]
    grouped["high_risk_rate"] = (
        grouped["high_risk_count"] / grouped["total_projects"] * 100
    ).round(2)
    grouped = grouped.sort_values(
        ["high_risk_rate", "high_risk_count"], ascending=[False, False]
    ).head(limit)

    groups = [
        {
            "name": row[column],
            "total_projects": int(row["total_projects"]),
            "high_risk_count": int(row["high_risk_count"]),
            "high_risk_rate": float(row["high_risk_rate"]),
            "flagged_amount": float(row["flagged_amount"]),
            "total_amount": float(row["total_amount"]),
            "rate_vs_national": round(float(row["high_risk_rate"]) - national_rate, 2),
        }
        for _, row in grouped.iterrows()
    ]

    return {
        "dimension": dimension,
        "min_count": min_count,
        "national_high_risk_rate": national_rate,
        "national_total_projects": total_projects,
        "national_high_risk_count": national_high_count,
        "groups": groups,
    }


@app.get("/projects")
def get_projects(limit: int = 20):
    v4_df = get_dataset()
    limit = max(1, min(limit, 100))
    projects = v4_df.sort_values(
        ["Risk_Score", "Final Amount (₹)"],
        ascending=[False, False]
    ).head(limit)

    return {
        "total_projects": len(v4_df),
        "returned_projects": len(projects),
        "projects": [
            {key: clean_value(value) for key, value in row.to_dict().items()}
            for _, row in projects.iterrows()
        ],
    }


@app.get("/projects/{work_id}")
def get_project(work_id: int):
    row = v4_project(work_id)
    return {"project": {
        key: clean_value(value)
        for key, value in row.to_dict().items()
    }}


@app.get("/projects/{work_id}/similar")
def get_similar_projects(work_id: int, limit: int = 5):
    v4_project(work_id)
    limit = max(1, min(limit, 20))
    results = find_similar_projects(work_id, top_n=limit)

    return {
        "work_id": work_id,
        "similar_projects": results
    }


@app.get("/projects/{work_id}/compare")
def compare_project(work_id: int, limit: int = 8):
    row = v4_project(work_id)
    limit = max(1, min(limit, 20))
    comparables = find_similar_projects(work_id, top_n=limit)

    target_amount = float(row.get("Final Amount (₹)") or 0)

    amounts = [
        float(c.get("Amount") or 0)
        for c in comparables
        if c.get("Amount") is not None
    ]
    cohort_count = len(amounts)

    if cohort_count:
        sorted_amounts = sorted(amounts)
        cohort_median = sorted_amounts[cohort_count // 2]
        cohort_average = sum(amounts) / cohort_count
        pricier_than = sum(1 for a in amounts if target_amount > a)
        cheaper_than = sum(1 for a in amounts if target_amount < a)
        equal_to = cohort_count - pricier_than - cheaper_than
        cost_percentile = round((pricier_than / cohort_count) * 100, 1)
    else:
        cohort_median = None
        cohort_average = None
        pricier_than = 0
        cheaper_than = 0
        equal_to = 0
        cost_percentile = None

    same_constituency_count = sum(
        1 for c in comparables if c.get("Same Constituency")
    )

    return {
        "target": {
            "work_id": int(row["Work ID"]),
            "description": clean_value(row.get("Work Description")),
            "state": clean_value(row.get("State")),
            "house": clean_value(row.get("House")),
            "category": clean_value(row.get("Category")),
            "constituency": clean_value(row.get("Constituency")),
            "amount": target_amount,
            "risk_score": clean_value(row.get("Risk_Score")),
            "risk_level": clean_value(row.get("Risk_Level")),
        },
        "cohort_stats": {
            "count": cohort_count,
            "average_amount": cohort_average,
            "median_amount": cohort_median,
            "target_pricier_than_count": pricier_than,
            "target_cheaper_than_count": cheaper_than,
            "target_equal_to_count": equal_to,
            "cost_percentile_vs_cohort": cost_percentile,
            "same_constituency_count": same_constituency_count,
            "peer_median": clean_value(row.get("peer_median")),
            "peer_count": clean_value(row.get("peer_count")),
            "amount_ratio_to_peer_median": clean_value(
                row.get("Amount_Ratio_to_Peer_Median")
            ),
        },
        "comparables": comparables,
    }


@app.get("/projects/by-risk/{level}")
def get_projects_by_risk(level: str, limit: int = 50, offset: int = 0):
    level = level.strip().upper()
    if level not in {"HIGH", "MEDIUM", "LOW"}:
        raise HTTPException(
            status_code=400,
            detail="level must be one of: high, medium, low"
        )

    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    v4_df = get_dataset()
    subset = v4_df[v4_df["Risk_Level"].fillna("LOW").astype(str).str.upper() == level]
    subset = subset.sort_values(
        ["Risk_Score", "Final Amount (₹)"], ascending=[False, False]
    )

    page = subset.iloc[offset: offset + limit]

    return {
        "risk_level": level,
        "total_at_this_level": len(subset),
        "returned": len(page),
        "offset": offset,
        "limit": limit,
        "projects": [
            {
                "work_id": clean_value(row.get("Work ID")),
                "description": clean_value(row.get("Work Description")),
                "state": clean_value(row.get("State")),
                "constituency": clean_value(row.get("Constituency")),
                "house": clean_value(row.get("House")),
                "category": clean_value(row.get("Category")),
                "amount": clean_value(row.get("Final Amount (₹)")),
                "risk_score": clean_value(row.get("Risk_Score")),
                "risk_level": clean_value(row.get("Risk_Level")),
                "risk_reasons": split_reasons(row.get("Risk_Reasons", "")),
            }
            for _, row in page.iterrows()
        ],
    }


@app.get("/projects/{work_id}/financial")
def get_financial_trail(work_id: int):
    row = v4_project(work_id)

    return {
        "work_id": work_id,
        "financial_trail": {
            "recommended_amount": clean_value(row.get("Recommended Amount (₹)")),
            "sanctioned_amount": clean_value(row.get("Sanctioned Amount (₹)")),
            "final_amount": clean_value(row.get("Final Amount (₹)")),
            "total_expenditure": clean_value(row.get("Expenditure_Total")),
            "sanction_minus_recommended": clean_value(
                row.get("Sanction_minus_Recommended")
            ),
            "expenditure_minus_final": clean_value(
                row.get("Expenditure_minus_Final")
            ),
            "expenditure_to_final_ratio": clean_value(
                row.get("Expenditure_to_Final_Ratio")
            ),
            "transaction_count": clean_value(row.get("Transaction_Count")),
            "vendor_count": clean_value(row.get("Vendor_Count")),
            "pending_payment_count": clean_value(
                row.get("Pending_Payment_Count")
            ),
            "successful_payment_count": clean_value(
                row.get("Successful_Payment_Count")
            ),
            "last_expenditure_date": clean_value(
                row.get("Last_Expenditure_Date")
            ),
            "has_expenditure_record": clean_value(
                row.get("Has_Expenditure_Record")
            ),
            "has_pending_payment": clean_value(
                row.get("Has_Pending_Payment")
            ),
            "reconciliation": clean_value(
                row.get("Financial_Reconciliation_Flag")
            ),
        }
    }


@app.get("/projects/{work_id}/timeline")
def get_project_timeline(work_id: int):
    row = v4_project(work_id)

    return {
        "work_id": work_id,
        "timeline": {
            "recommendation_date": clean_value(row.get("Recommendation Date")),
            "sanction_date": clean_value(row.get("Sanction Date")),
            "completion_date": clean_value(row.get("Completed Date")),
            "recommendation_to_sanction_days": clean_value(
                row.get("Recommendation_to_Sanction_Days")
            ),
            "sanction_to_completion_days": clean_value(
                row.get("Sanction_to_Completion_Days")
            ),
            "work_stage": clean_value(row.get("Work Stage")),
            "is_completed": clean_value(row.get("Is Completed")),
            "status": clean_value(row.get("Timeline_Flag")),
        }
    }


@app.get("/projects/{work_id}/mp-context")
def get_mp_context(work_id: int):
    row = v4_project(work_id)

    fields = {
        "mp_name": "MP Name",
        "constituency": "Constituency",
        "state": "State",
        "house": "House",
        "allocated_amount": "MP Allocated Amount (₹)",
        "total_expenditure": "MP Total Expenditure (₹)",
        "utilization_percent": "MP Utilization %",
        "completion_rate_percent": "MP Completion Rate %",
        "completed_works": "MP Completed Works",
        "recommended_works": "MP Recommended Works",
        "pending_payments": "MP Pending Payments",
        "unpaid_vendor_balance": "MP Unpaid Vendor Balance (₹)",
        "transaction_count": "MP Transaction Count",
    }

    return {
        "work_id": work_id,
        "mp_context": {
            key: clean_value(row.get(column))
            for key, column in fields.items()
        }
    }


@app.get("/projects/{work_id}/risk-breakdown")
def get_risk_breakdown(work_id: int):
    row = v4_project(work_id)

    breakdown = parse_risk_breakdown(row.get("Risk_Breakdown_Raw", ""))
    risk_score = int(clean_value(row.get("Risk_Score")) or 0)

    grouped = {}
    for entry in breakdown:
        grouped[entry["dimension"]] = grouped.get(entry["dimension"], 0) + entry["points"]

    dimension_totals = [
        {"dimension": dimension, "points": points}
        for dimension, points in sorted(
            grouped.items(), key=lambda item: item[1], reverse=True
        )
    ]

    return {
        "work_id": work_id,
        "risk_score": risk_score,
        "risk_level": clean_value(row.get("Risk_Level")),
        "breakdown": breakdown,
        "dimension_totals": dimension_totals,
        "points_accounted_for": sum(item["points"] for item in breakdown),
        "disclaimer": (
            "Each line is a point contribution from the automated screening "
            "pipeline. It explains how the score was composed — it does not "
            "establish fraud, corruption, or wrongdoing."
        ),
    }


@app.get("/investigate/{work_id}")
def investigate_project(work_id: int, similar_limit: int = 5):
    row = v4_project(work_id)

    risk_score = int(clean_value(row.get("Risk_Score")) or 0)
    risk_level = str(clean_value(row.get("Risk_Level")) or "LOW").upper()
    risk_reasons = split_reasons(row.get("Risk_Reasons", ""))

    has_images = parse_bool(row.get("Has Images", False))
    evidence_status = "Image evidence available" if has_images else "No image evidence available"

    similar_limit = max(1, min(similar_limit, 20))
    similar_projects = find_similar_projects(work_id, top_n=similar_limit)

    recommended_actions = [
        "Review the project amount against contextual comparable projects."
    ]

    if row.get("Financial_Reconciliation_Flag") == "Expenditure record unavailable":
        recommended_actions.append("Verify the project's expenditure/payment records.")

    if row.get("Financial_Reconciliation_Flag") == "Expenditure differs from final amount":
        recommended_actions.append("Reconcile aggregated expenditure against the final project amount.")

    if row.get("Has_Pending_Payment") is True:
        recommended_actions.append("Review the in-progress payment transactions and supporting records.")

    if row.get("Timeline_Flag") != "Chronology consistent":
        recommended_actions.append("Verify the recommendation, sanction and completion dates.")

    if not has_images:
        recommended_actions.append("Verify supporting evidence because no image evidence is available.")

    if similar_projects:
        recommended_actions.append("Compare project scope and administrative context with comparable projects.")

    if not recommended_actions:
        recommended_actions.append("Routine verification may be sufficient based on available automated indicators.")

    priority = {
        "HIGH": "High investigation priority",
        "MEDIUM": "Medium investigation priority",
        "LOW": "Low investigation priority",
    }.get(risk_level, "Low investigation priority")

    return {
        "investigation": {
            "work_id": work_id,
            "priority": priority,
            "risk": {
                "score": risk_score,
                "level": risk_level,
                "reasons": risk_reasons,
                "dimensions": split_reasons(row.get("Risk_Dimensions", "")),
                "breakdown": parse_risk_breakdown(row.get("Risk_Breakdown_Raw", "")),
                "peer_median": clean_value(row.get("peer_median")),
                "peer_group_size": clean_value(row.get("peer_count")),
                "amount_ratio_to_peer_median": clean_value(
                    row.get("Amount_Ratio_to_Peer_Median")
                ),
            },
            "project": {
                "description": clean_value(row.get("Work Description")),
                "category": clean_value(row.get("Category")),
                "mp_name": clean_value(row.get("MP Name")),
                "constituency": clean_value(row.get("Constituency")),
                "state": clean_value(row.get("State")),
                "house": clean_value(row.get("House")),
                "amount": clean_value(row.get("Final Amount (₹)")),
            },
            "evidence": {
                "has_images": has_images,
                "status": evidence_status,
                "data_quality": clean_value(row.get("Data_Quality_Flag")),
            },
            "financial": {
                "recommended_amount": clean_value(row.get("Recommended Amount (₹)")),
                "sanctioned_amount": clean_value(row.get("Sanctioned Amount (₹)")),
                "final_amount": clean_value(row.get("Final Amount (₹)")),
                "total_expenditure": clean_value(row.get("Expenditure_Total")),
                "expenditure_minus_final": clean_value(row.get("Expenditure_minus_Final")),
                "sanction_minus_recommended": clean_value(
                    row.get("Sanction_minus_Recommended")
                ),
                "reconciliation": clean_value(
                    row.get("Financial_Reconciliation_Flag")
                ),
                "pending_payment_count": clean_value(
                    row.get("Pending_Payment_Count")
                ),
                "transaction_count": clean_value(row.get("Transaction_Count")),
                "vendor_count": clean_value(row.get("Vendor_Count")),
            },
            "timeline": {
                "recommendation_date": clean_value(row.get("Recommendation Date")),
                "sanction_date": clean_value(row.get("Sanction Date")),
                "completion_date": clean_value(row.get("Completed Date")),
                "recommendation_to_sanction_days": clean_value(
                    row.get("Recommendation_to_Sanction_Days")
                ),
                "sanction_to_completion_days": clean_value(
                    row.get("Sanction_to_Completion_Days")
                ),
                "status": clean_value(row.get("Timeline_Flag")),
            },
            "mp_context": {
                "allocated_amount": clean_value(row.get("MP Allocated Amount (₹)")),
                "total_expenditure": clean_value(row.get("MP Total Expenditure (₹)")),
                "utilization_percent": clean_value(row.get("MP Utilization %")),
                "completion_rate_percent": clean_value(row.get("MP Completion Rate %")),
                "completed_works": clean_value(row.get("MP Completed Works")),
                "recommended_works": clean_value(row.get("MP Recommended Works")),
                "pending_payments": clean_value(row.get("MP Pending Payments")),
                "unpaid_vendor_balance": clean_value(
                    row.get("MP Unpaid Vendor Balance (₹)")
                ),
            },
            "similar_projects": similar_projects,
            "recommended_verification": recommended_actions,
            "disclaimer": (
                "Automated indicators identify projects for closer review. "
                "They do not establish fraud, corruption, overpricing, or wrongdoing."
            ),
        }
    }


@app.get("/agent/investigate")
def agent_investigate(query: str):
    response = investigate_with_agent(query)
    return {
        "query": query,
        "response": response,
        "trace": get_agent_trace()
    }