"""chat_bot_states table (autopiloto Nexabot por chat: activo/pausado)

Revision ID: h8c9d0e1f2g3
Revises: g7b8c9d0e1f2
Create Date: 2026-08-24 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'h8c9d0e1f2g3'
down_revision: Union[str, Sequence[str], None] = 'g7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('chat_bot_states',
    sa.Column('chat_id', sa.String(length=32), nullable=False),
    sa.Column('bot_enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
    sa.Column('updated_at', sa.TIMESTAMP(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.PrimaryKeyConstraint('chat_id')
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('chat_bot_states')
