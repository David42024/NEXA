"""objection_status (none/rebate) en offerings

Reemplaza el booleano `objection_handled` por un estado textual que distingue
"no fue necesario" (none) de "usé speech de rebate" (rebate).

Revision ID: c3d4e5f6a7b8
Revises: a1b2c3d4e5f6
Create Date: 2026-08-14 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('offerings', sa.Column('objection_status', sa.String(length=20), nullable=True))
    op.execute("UPDATE offerings SET objection_status = 'rebate' WHERE objection_handled = 1")
    op.drop_column('offerings', 'objection_handled')


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column('offerings', sa.Column('objection_handled', sa.Boolean(), nullable=True))
    op.execute("UPDATE offerings SET objection_handled = 1 WHERE objection_status = 'rebate'")
    op.drop_column('offerings', 'objection_status')