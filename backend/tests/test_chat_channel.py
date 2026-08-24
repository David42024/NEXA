"""Tests del canal de contacto por mensajes (chat con el cliente via link publico)."""
from tests.conftest import login, auth


def _create_chat(c, client_id="C00001", email="asesor@nexa.demo", password="asesor123"):
    token = login(c, email, password)
    r = c.post("/api/chats", json={"client_id": client_id}, headers=auth(token))
    assert r.status_code == 201
    return r.json(), token


def test_crear_chat_genera_mensaje_inicial_del_bot(client):
    data, _ = _create_chat(client)
    assert data["chat_id"]
    assert len(data["messages"]) == 1
    first = data["messages"][0]
    assert first["sender"] == "bot"
    assert first["body"].strip()
    # El chat es legible sin autenticacion (link publico tipo /llamada/:id)
    pub = client.get(f"/api/chats/{data['chat_id']}/messages")
    assert pub.status_code == 200
    assert [m["id"] for m in pub.json()] == [first["id"]]


def test_cliente_recibe_respuesta_automatica_del_bot(client):
    data, _ = _create_chat(client)

    r = client.post(f"/api/chats/{data['chat_id']}/client-messages", json={"body": "cuanto costaria el plan?"})
    assert r.status_code == 200
    msgs = r.json()["messages"]
    assert [m["sender"] for m in msgs] == ["cliente", "bot"]
    assert msgs[1]["body"].strip()

    # El historial acumulado refleja la conversacion completa
    hist = client.get(f"/api/chats/{data['chat_id']}/messages").json()
    assert [m["sender"] for m in hist] == ["bot", "cliente", "bot"]

    # Segundo mensaje del cliente -> otra respuesta del bot
    r2 = client.post(f"/api/chats/{data['chat_id']}/client-messages", json={"body": "y que gigas incluye?"})
    assert [m["sender"] for m in r2.json()["messages"]] == ["cliente", "bot"]


def test_asesor_toma_la_conversacion_y_el_bot_calla(client):
    data, token = _create_chat(client)
    chat_url = f"/api/chats/{data['chat_id']}"

    # El asesor escribe manualmente
    r = client.post(f"{chat_url}/asesor-messages", json={"body": "Hola, soy tu asesor de Movistar"}, headers=auth(token))
    assert r.status_code == 200
    assert r.json()["sender"] == "asesor"

    # Ahora el cliente escribe y el bot NO responde automaticamente
    rc = client.post(f"{chat_url}/client-messages", json={"body": "perfecto, te leo"})
    assert [m["sender"] for m in rc.json()["messages"]] == ["cliente"]

    # Otro usuario no dueño no puede escribir en ese chat
    otro = auth(login(client, "supervisor@nexa.demo", "supervisor123"))
    assert client.post(f"{chat_url}/asesor-messages", json={"body": "x"}, headers=otro).status_code == 403


def test_polling_incremental_con_after(client):
    data, _ = _create_chat(client)
    last_id = data["messages"][0]["id"]

    client.post(f"/api/chats/{data['chat_id']}/client-messages", json={"body": "hola"})
    nuevos = client.get(f"/api/chats/{data['chat_id']}/messages?after={last_id}").json()
    assert all(m["id"] > last_id for m in nuevos)
    assert {m["sender"] for m in nuevos} == {"cliente", "bot"}
    # after mayor a todo -> vacio (no 404)
    assert client.get(f"/api/chats/{data['chat_id']}/messages?after=999999").json() == []


def test_toggle_del_autopiloto_del_bot(client):
    data, token = _create_chat(client)
    assert data["bot_enabled"] is True
    url = f"/api/chats/{data['chat_id']}"
    h = auth(token)

    # Pausar: el cliente escribe y nadie responde automaticamente
    assert client.patch(f"{url}/bot", json={"enabled": False}, headers=h).json() == {"enabled": False}
    r1 = client.post(f"{url}/client-messages", json={"body": "sigues ahi?"})
    assert [m["sender"] for m in r1.json()["messages"]] == ["cliente"]

    # Reactivar: el bot vuelve a responder
    assert client.patch(f"{url}/bot", json={"enabled": True}, headers=h).json()["enabled"] is True
    r2 = client.post(f"{url}/client-messages", json={"body": "listo, te leo"})
    assert [m["sender"] for m in r2.json()["messages"]] == ["cliente", "bot"]

    # Otro usuario no puede alternar el autopiloto ajeno; chat inexistente 404
    otro = auth(login(client, "supervisor@nexa.demo", "supervisor123"))
    assert client.patch(f"{url}/bot", json={"enabled": False}, headers=otro).status_code == 403
    assert client.patch("/api/chats/noexiste/bot", json={"enabled": True}, headers=h).status_code == 404


def test_el_chat_es_persistente_y_el_link_no_cambia(client):
    data1, token = _create_chat(client)
    first_id = data1["messages"][0]["id"]

    # Reabrir el modal recupera el MISMO chat con su historial (link estable)
    data2, _ = _create_chat(client)
    assert data2["chat_id"] == data1["chat_id"]
    assert [m["id"] for m in data2["messages"]] == [first_id]

    # El cliente escribe por el mismo link y todo queda en el mismo hilo
    client.post(f"/api/chats/{data2['chat_id']}/client-messages", json={"body": "hola de nuevo"})
    hist = client.get(f"/api/chats/{data1['chat_id']}/messages").json()
    assert [m["sender"] for m in hist] == ["bot", "cliente", "bot"]

    # Otro asesor tiene su propio hilo independiente con el mismo cliente
    data3, _ = _create_chat(client, email="supervisor@nexa.demo", password="supervisor123")
    assert data3["chat_id"] != data1["chat_id"]

    # El estado del autopiloto tambien persiste entre aperturas
    h = auth(token)
    client.patch(f"/api/chats/{data1['chat_id']}/bot", json={"enabled": False}, headers=h)
    data4, _ = _create_chat(client)
    assert data4["chat_id"] == data1["chat_id"]
    assert data4["bot_enabled"] is False


def test_validaciones_y_errores(client):
    token = login(client)
    h = auth(token)

    # Crear chat con cliente inexistente / sin auth
    assert client.post("/api/chats", json={"client_id": "NOPE99"}, headers=h).status_code == 404
    assert client.post("/api/chats", json={"client_id": "C00001"}).status_code in (401, 403)

    # Chat inexistente en lectura y escritura
    assert client.get("/api/chats/noexiste/messages").status_code == 404
    assert client.post("/api/chats/noexiste/client-messages", json={"body": "x"}).status_code == 404

    # Cuerpo vacio rechazado en ambos lados
    data, atok = _create_chat(client)
    url = f"/api/chats/{data['chat_id']}"
    assert client.post(f"{url}/client-messages", json={"body": "   "}).status_code == 422
    assert client.post(f"{url}/asesor-messages", json={"body": ""}, headers=h).status_code == 422
