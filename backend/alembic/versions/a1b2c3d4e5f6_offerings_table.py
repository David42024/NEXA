"""offerings table (seguimiento E2E del ofrecimiento)

Revision ID: a1b2c3d4e5f6
Revises: 37147d3f683f
Create Date: 2026-08-13 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '37147d3f683f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('offerings',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('client_id', sa.String(length=10), nullable=False),
    sa.Column('offer_id', sa.Integer(), nullable=True),
    sa.Column('asesor_id', sa.Integer(), nullable=True),
    sa.Column('channel', sa.String(length=20), nullable=True),
    sa.Column('message_text', sa.Text(), nullable=True),
    sa.Column('stage', sa.String(length=20), nullable=False),
    sa.Column('contact_status', sa.String(length=20), nullable=True),
    sa.Column('objection_handled', sa.Boolean(), nullable=True),
    sa.Column('speech_rebate', sa.Text(), nullable=True),
    sa.Column('evidence_type', sa.String(length=30), nullable=True),
    sa.Column('evidence_ref', sa.String(length=100), nullable=True),
    sa.Column('result', sa.String(length=20), nullable=True),
    sa.Column('rejection_reason', sa.String(length=50), nullable=True),
    sa.Column('created_at', sa.TIMESTAMP(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.Column('updated_at', sa.TIMESTAMP(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.ForeignKeyConstraint(['asesor_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ),
    sa.ForeignKeyConstraint(['offer_id'], ['offers.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_offerings_id'), 'offerings', ['id'], unique=False)
    op.create_index(op.f('ix_offerings_client_id'), 'offerings', ['client_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_offerings_client_id'), table_name='offerings')
    op.drop_index(op.f('ix_offerings_id'), table_name='offerings')
    op.drop_table('offerings')