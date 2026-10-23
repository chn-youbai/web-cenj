import os
import sys
import subprocess

TARGET_PHOTOS_SCRIPT = os.path.abspath("f:/zuomian/code/web-cenj-photos/sync_photos.py")

def main():
    if not os.path.exists(TARGET_PHOTOS_SCRIPT):
        print(f"Error: Could not find {TARGET_PHOTOS_SCRIPT}")
        sys.exit(1)
        
    cmd = [sys.executable, TARGET_PHOTOS_SCRIPT]
    subprocess.run(cmd)

if __name__ == "__main__":
    main()
