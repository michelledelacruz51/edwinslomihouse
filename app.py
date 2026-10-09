import os
from typing import Any, Optional
from uuid import UUID

import httpx
from fastapi import Body, Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_KEYS = {
    "foodHubOrders",
    "foodHubOrderStatuses",
    "foodHubKitchenOrders",
    "foodHubProducts",
    "foodHubInventory",
    "foodHubSettings",
    "foodHubStaff",
    "foodHubRestaurantLogo",
    "foodHubNextOrderNumber",
    "foodHubOrderHistoryCleared",
}
bearer_scheme = HTTPBearer(auto_error=False)

app = FastAPI(title="Edwin's Lomi House POS API", version="1.0.0")
app.mount("/image", StaticFiles(directory=os.path.join(BASE_DIR, "image")), name="image")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def required_setting(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise HTTPException(status_code=503, detail=f"Server configuration is missing {name}.")
    return value


def authenticate(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> tuple[UUID, str]:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="A valid Supabase access token is required.")

    supabase_url = required_setting("SUPABASE_URL").rstrip("/")
    anon_key = required_setting("SUPABASE_ANON_KEY")

    try:
        response = httpx.get(
            f"{supabase_url}/auth/v1/user",
            headers={
                "apikey": anon_key,
                "Authorization": f"Bearer {credentials.credentials}",
            },
            timeout=10.0,
        )
    except httpx.RequestError as error:
        raise HTTPException(status_code=503, detail="Supabase Auth is unavailable.") from error

    if response.status_code in (401, 403):
        raise HTTPException(status_code=401, detail="The Supabase access token is invalid or expired.")
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="Supabase could not verify the access token.")

    try:
        user_id = UUID(response.json()["id"])
    except (KeyError, TypeError, ValueError) as error:
        raise HTTPException(status_code=502, detail="Supabase returned an invalid user identity.") from error

    return user_id, credentials.credentials


def database_request(method: str, path: str, access_token: str, **kwargs: Any) -> Any:
    supabase_url = required_setting("SUPABASE_URL").rstrip("/")
    anon_key = required_setting("SUPABASE_ANON_KEY")

    headers = {
        "apikey": anon_key,
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    headers.update(kwargs.pop("headers", {}))

    try:
        response = httpx.request(
            method,
            f"{supabase_url}/rest/v1/{path}",
            headers=headers,
            timeout=15.0,
            **kwargs,
        )
    except httpx.RequestError as error:
        raise HTTPException(status_code=503, detail="Supabase Database is unavailable.") from error

    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Supabase Database rejected the request.")
    if not response.content:
        return None

    try:
        return response.json()
    except ValueError as error:
        raise HTTPException(status_code=502, detail="Supabase Database returned an invalid response.") from error


@app.get("/")
def index() -> FileResponse:
    return FileResponse(os.path.join(BASE_DIR, "index.html"))


@app.get("/style.css")
def stylesheet() -> FileResponse:
    return FileResponse(os.path.join(BASE_DIR, "style.css"), media_type="text/css")


@app.get("/{script_name}.js")
def javascript(script_name: str) -> FileResponse:
    if script_name not in {"script", "auth", "backend", "supabase-config"}:
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(os.path.join(BASE_DIR, f"{script_name}.js"), media_type="text/javascript")


@app.get("/api/data")
def get_data(authenticated: tuple[UUID, str] = Depends(authenticate)) -> dict[str, Any]:
    user_id, access_token = authenticated
    rows = database_request(
        "GET",
        "pos_user_data",
        access_token,
        params={
            "select": "data_key,data",
            "user_id": f"eq.{user_id}",
        },
    )
    if not isinstance(rows, list):
        raise HTTPException(status_code=502, detail="Supabase Database returned invalid POS data.")

    return {
        row["data_key"]: row["data"]
        for row in rows
        if isinstance(row, dict) and row.get("data_key") in DATA_KEYS and "data" in row
    }


@app.put("/api/data/{data_key}")
def put_data(
    data_key: str,
    value: Any = Body(...),
    authenticated: tuple[UUID, str] = Depends(authenticate),
) -> dict[str, bool]:
    if data_key not in DATA_KEYS:
        raise HTTPException(status_code=404, detail="Unknown POS data key.")

    user_id, access_token = authenticated
    database_request(
        "POST",
        "pos_user_data?on_conflict=user_id,data_key",
        access_token,
        headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
        json={
            "user_id": str(user_id),
            "data_key": data_key,
            "data": value,
        },
    )
    return {"saved": True}


@app.get("/{file_name}")
def static_file(file_name: str) -> FileResponse:
    if file_name != "index.html":
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(os.path.join(BASE_DIR, file_name), media_type="text/html")
