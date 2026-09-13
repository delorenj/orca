"""ASAR metadata updates preserve every packed payload byte."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("install_owner", Path(__file__).with_name("install-hook-hub-ownership.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ArchiveTests(unittest.TestCase):
    def test_asar_roundtrip_keeps_payload_and_unicode_metadata(self):
        header = {"files": {"é.txt": {"offset": "0", "size": 7}, "unpacked.js": {"unpacked": True, "size": 9}}}
        body = b"payload\0\xff"
        encoded = module.pack(header, body)
        decoded, actual = module.unpack(encoded)
        self.assertEqual(decoded, header)
        self.assertEqual(actual, body)
        decoded["files"]["unpacked.js"]["size"] = 50000
        self.assertEqual(module.unpack(module.pack(decoded, actual))[1], body)

    def test_rejects_invalid_asar_header(self):
        with self.assertRaises(ValueError):
            module.unpack(b"\0" * 16)


if __name__ == "__main__":
    unittest.main()
