import httpx


async def test_item_crud_round_trip(client: httpx.AsyncClient) -> None:
    created = await client.post("/api/items", json={"name": "demo", "description": "first item"})
    assert created.status_code == 201
    item = created.json()
    assert item["name"] == "demo"

    fetched = await client.get(f"/api/items/{item['id']}")
    assert fetched.status_code == 200
    assert fetched.json() == item

    listed = await client.get("/api/items")
    assert listed.status_code == 200
    assert any(i["id"] == item["id"] for i in listed.json())


async def test_get_missing_item_returns_404(client: httpx.AsyncClient) -> None:
    response = await client.get("/api/items/999999")
    assert response.status_code == 404
