"""sync_sequences: resincroniza las secuencias de Postgres tras migrar datos con IDs explicitos.

La migracion de datos desde SQLite a Neon inserto filas con ids explicitos, pero las
secuencias (SERIAL) de Postgres quedaron apuntando a un valor menor, provocando
"duplicate key value violates unique constraint" en el siguiente INSERT.

Solo aplica en Postgres; en SQLite no hay secuencias (INTEGER PRIMARY KEY reusa max+1).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, object, None] = "d4e5f6a7b8c9"

# Tablas cuyo PK es un id entero autoincremental (SERIAL/IDENTITY).
SEQUENCE_TABLES = [
    "users",
    "offers",
    "recommendations",
    "interactions",
    "model_feedback",
    "data_requests",
    "system_logs",
    "login_attempts",
    "offerings",
]


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    for table in SEQUENCE_TABLES:
        # setval(seq, max, true) -> el proximo nextval() es max+1.
        op.execute(
            sa.text(
                f"SELECT setval(pg_get_serial_sequence(:t, 'id'), "
                f"COALESCE((SELECT MAX(id) FROM {table}), 1), true)"
            ).bindparams(t=table)
        )


def downgrade() -> None:
    # No hay forma portable de revertir el estado de una secuencia.
    pass