import os
from dotenv import load_dotenv
from pathlib import Path

if __name__ == "__main__":
    #load .env
    current_file = Path(__file__)
    backend_dir = current_file.parent.parent
    env_path = backend_dir.parent / '.env'
    load_dotenv(env_path)

    API_KEY = os.getenv("VIRUSTOTAL_API_KEY")
    print(API_KEY)