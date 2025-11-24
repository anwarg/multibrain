import os
from cryptography.fernet import Fernet


_fernet_instance = None


def get_fernet() -> Fernet:
    """Get or create Fernet instance for encryption/decryption."""
    global _fernet_instance
    
    if _fernet_instance is None:
        key = os.getenv("API_KEYS_ENC_KEY")
        
        if not key:
            key = Fernet.generate_key().decode()
            print("WARNING: API_KEYS_ENC_KEY not set. Using ephemeral key for development.")
            print("WARNING: Encrypted data will not persist across server restarts.")
        
        _fernet_instance = Fernet(key.encode() if isinstance(key, str) else key)
    
    return _fernet_instance


def encrypt(plaintext: str) -> str:
    """Encrypt plaintext string and return base64-encoded ciphertext."""
    if not plaintext:
        return ""
    
    fernet = get_fernet()
    ciphertext_bytes = fernet.encrypt(plaintext.encode())
    return ciphertext_bytes.decode()


def decrypt(ciphertext: str) -> str:
    """Decrypt base64-encoded ciphertext and return plaintext string."""
    if not ciphertext:
        return ""
    
    fernet = get_fernet()
    plaintext_bytes = fernet.decrypt(ciphertext.encode())
    return plaintext_bytes.decode()
