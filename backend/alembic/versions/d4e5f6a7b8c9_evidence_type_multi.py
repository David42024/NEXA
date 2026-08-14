"""evidence_type ampliado para soportar multiples medios probatorios

Antes era String(30), suficiente para un unico valor ("call_audio"). Ahora puede
guardar varios separados por coma ("call_audio,platform_register").

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-08-14 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema (compatible SQLite via batch)."""
    with op.batch_alter_table('offerings') as batch_op:
        batch_op.alter_column(
            'evidence_type',
            existing_type=sa.String(length=30),
            type_=sa.String(length=60),
            existing_nullable=True,
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('offerings') as batch_op:
        batch_op.alter_column(
            'evidence_type',
            existing_type=sa.String(length=60),
            type_=sa.String(length=30),
            existing_nullable=True,
        )