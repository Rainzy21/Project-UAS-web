"""initial_schema

Revision ID: 0001_initial
Revises: 
Create Date: 2026-05-24

"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # users table
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("password_changed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # movies table
    op.create_table(
        "movies",
        sa.Column("tmdb_id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("overview", sa.Text(), nullable=True),
        sa.Column("poster_url", sa.String(500), nullable=True),
        sa.Column("rating", sa.Float(), nullable=True),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("language", sa.String(10), nullable=True),
        sa.Column("genres", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    # saved_movies table
    op.create_table(
        "saved_movies",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tmdb_id", sa.Integer(), sa.ForeignKey("movies.tmdb_id", ondelete="CASCADE"), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("tag", sa.String(100), nullable=True),
        sa.Column("saved_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id", "tmdb_id", name="uq_saved_user_movie"),
    )
    op.create_index("ix_saved_movies_user_id", "saved_movies", ["user_id"])
    op.create_index("ix_saved_movies_tmdb_id", "saved_movies", ["tmdb_id"])

    # recommendation_logs table
    op.create_table(
        "recommendation_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("preferences", sa.JSON(), nullable=False),
        sa.Column("ai_response", sa.JSON(), nullable=False),
        sa.Column("tmdb_ids", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_recommendation_logs_user_id", "recommendation_logs", ["user_id"])

    # preference_presets table
    op.create_table(
        "preference_presets",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("preferences", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_preference_presets_user_id", "preference_presets", ["user_id"])


def downgrade() -> None:
    op.drop_table("preference_presets")
    op.drop_table("recommendation_logs")
    op.drop_table("saved_movies")
    op.drop_table("movies")
    op.drop_table("users")
