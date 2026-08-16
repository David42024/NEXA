"""cartera_asesor: asigna cada cliente a un asesor comercial (cartera por CSV).

Revision ID: c1a2b3c4d5e6
Revises: e5f6a7b8c9d0
Create Date: 2026-08-15

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("clients") as batch:
        batch.add_column(sa.Column("asesor_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_clients_asesor_id_users", "users", ["asesor_id"], ["id"])
        batch.create_index(op.f("ix_clients_asesor_id"), ["asesor_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("clients") as batch:
        batch.drop_index(op.f("ix_clients_asesor_id"))
        batch.drop_constraint("fk_clients_asesor_id_users", type_="foreignkey")
        batch.drop_column("asesor_id")