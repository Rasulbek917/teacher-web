from django.contrib.auth.hashers import BasePasswordHasher
from django.utils.crypto import constant_time_compare
import bcrypt


class LegacyBCryptPasswordHasher(BasePasswordHasher):
    algorithm = "legacy_bcrypt"

    def encode(self, password, salt):
        hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        return f"{self.algorithm}${hashed}"

    def verify(self, password, encoded):
        try:
            _, hashed = encoded.split("$", 1)
            return bcrypt.checkpw(password.encode(), hashed.encode())
        except (ValueError, TypeError):
            return False

    def must_update(self, encoded):
        # Successful legacy login upgrades the hash to Django's current default.
        return True

    def safe_summary(self, encoded):
        try:
            _, hashed = encoded.split("$", 1)
            return {"algorithm": self.algorithm, "work_factor": hashed.split("$")[2]}
        except Exception:
            return {"algorithm": self.algorithm}
