from app.core.database import engine, Base
from app.models import user, movie  # noqa: F401 – register models


def init_db():
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    init_db()
    print("Database tables created.")
