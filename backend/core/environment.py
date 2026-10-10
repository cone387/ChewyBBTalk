"""Load the deployment's root .env without replacing process environment values."""

from pathlib import Path

from dotenv import load_dotenv

SOURCE_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = SOURCE_ROOT if (SOURCE_ROOT / 'pyproject.toml').is_file() else Path.cwd()
ROOT_DIR = (
    BACKEND_DIR.parent
    if BACKEND_DIR == SOURCE_ROOT and BACKEND_DIR.name == 'backend'
    else BACKEND_DIR
)


def load_environment(path=None):
    # Do not expand $ expressions: passwords must remain literal across Docker,
    # Python and local development. The file is configuration, never shell code.
    load_dotenv(path or ROOT_DIR / '.env', override=False, interpolate=False)


load_environment()
