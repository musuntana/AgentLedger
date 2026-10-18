# SPDX-License-Identifier: Apache-2.0
"""The exact payment-attempt authorization is single-writer across processes."""
import concurrent.futures
import importlib.util
import json
import os
import sqlite3
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "tools" / "charge-attempt-journal.py"
spec = importlib.util.spec_from_file_location("charge_attempt_journal", SCRIPT)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

def candidate(**updates):
    value = {
        "schemaVersion": "agentledger.precharge.v1",
        "ledger": "0x" + "11" * 20,
        "taskId": "0x" + "22" * 32,
        "payer": "0x" + "33" * 20,
        "approvalNonce": "0x" + "44" * 32,
        "paymentNonce": "0x" + "55" * 32,
        "quoteDigest": "0x" + "66" * 32,
        "payloadDigest": "0x" + "77" * 32,
    }
    value.update(updates)
    return value

class ChargeAttemptTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "charge.db"

    def db(self):
        db = m.connect(self.path)
        self.addCleanup(db.close)
        return db

    def test_same_payload_or_distinct_payment_nonce_never_authorized_twice(self):
        db = self.db()
        self.assertEqual(m.reserve(db, candidate())["result"], "RESERVED_FIRST_ATTEMPT")
        self.assertEqual(m.reserve(db, candidate())["result"], "BLOCKED_EXISTING_ATTEMPT_NO_RECHARGE")
        self.assertEqual(m.reserve(db, candidate(paymentNonce="0x" + "99" * 32))["result"],
                         "BLOCKED_EXISTING_ATTEMPT_NO_RECHARGE")
        self.assertEqual(db.execute("SELECT count(*) FROM charge_attempts").fetchone()[0], 1)

    def test_payment_nonce_cannot_be_reused_on_different_task(self):
        db = self.db()
        m.reserve(db, candidate())
        self.assertEqual(m.reserve(db, candidate(
            taskId="0x" + "aa" * 32,approvalNonce="0x" + "bb" * 32,
            quoteDigest="0x" + "cc" * 32))["result"], "BLOCKED_EXISTING_ATTEMPT_NO_RECHARGE")

    def test_quote_nonce_cannot_authorize_new_task(self):
        db = self.db()
        m.reserve(db, candidate())
        self.assertEqual(m.reserve(db, candidate(
            taskId="0x" + "aa" * 32,paymentNonce="0x" + "bb" * 32,
            quoteDigest="0x" + "cc" * 32))["result"], "BLOCKED_EXISTING_ATTEMPT_NO_RECHARGE")

    def test_invalid_reservation_stays_out_of_database(self):
        db = self.db()
        for patch in [{"paymentNonce":"0x123"}, {"payer":"not address"},
                      {"schemaVersion":"bad"}, {"surprise":True}]:
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                m.reserve(db,candidate(**patch))
        self.assertEqual(db.execute("SELECT count(*) FROM charge_attempts").fetchone()[0], 0)

    def test_concurrent_processes_only_one_can_enter_payment_middleware(self):
        env = os.environ.copy()
        env["AGENTLEDGER_CHARGE_DB"] = str(self.path)
        cmd = [sys.executable, str(SCRIPT), "reserve"]
        def call(_):
            return subprocess.run(cmd,input=json.dumps(candidate()),text=True,
                                  capture_output=True,timeout=10,env=env)
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            outputs = list(pool.map(call, range(10)))
        codes = [p.returncode for p in outputs]
        self.assertEqual(codes.count(0),1,[(p.returncode,p.stdout,p.stderr) for p in outputs])
        self.assertEqual(codes.count(3),9,[(p.returncode,p.stdout,p.stderr) for p in outputs])
        self.assertEqual(self.db().execute("SELECT count(*) FROM charge_attempts").fetchone()[0],1)


    def hint(self, **updates):
        payload = {
            "schemaVersion": "agentledger.tx-hint.v1",
            "ledger": candidate()["ledger"],
            "taskId": candidate()["taskId"],
            "payer": candidate()["payer"],
            "paymentNonce": candidate()["paymentNonce"],
            "transaction": "0x" + "88" * 32,
        }
        payload.update(updates)
        return payload

    def test_callback_hint_survives_restart_without_creating_paid_state(self):
        db = self.db()
        m.reserve(db, candidate())
        self.assertIsNone(m.inspect(db, candidate()["paymentNonce"])["unverifiedTransactionHint"])
        first = m.attach_hint(db, self.hint())
        self.assertEqual(first["result"], "TX_HINT_STORED_UNVERIFIED")
        self.assertEqual(first["paymentStatus"], "PaymentUnknown")
        self.assertFalse(first["chargeAgain"])
        reopened = self.db()
        stored = m.inspect(reopened, candidate()["paymentNonce"])
        self.assertEqual(stored["unverifiedTransactionHint"]["transaction_hash"], self.hint()["transaction"])
        self.assertEqual(stored["admission"]["status"], "RESERVED_RECONCILE_ONLY")
        self.assertEqual(m.attach_hint(reopened, self.hint())["result"], "TX_HINT_ALREADY_PRESENT")
        self.assertEqual(m.reserve(reopened, candidate())["result"], "BLOCKED_EXISTING_ATTEMPT_NO_RECHARGE")
        self.assertEqual(reopened.execute("SELECT count(*) FROM transaction_hints").fetchone()[0], 1)

    def test_hint_identity_and_transaction_conflicts_fail_closed(self):
        db = self.db()
        m.reserve(db, candidate())
        for patch in [
            {"ledger": "0x" + "aa" * 20},
            {"payer": "0x" + "bb" * 20},
            {"taskId": "0x" + "cc" * 32},
            {"paymentNonce": "0x" + "dd" * 32},
            {"transaction": "BAD_HASH"},
            {"extra": "unexpected"},
        ]:
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                m.attach_hint(db, self.hint(**patch))
        self.assertIsNone(m.inspect(db, candidate()["paymentNonce"])["unverifiedTransactionHint"])
        m.attach_hint(db, self.hint())
        with self.assertRaisesRegex(ValueError, "conflicting transaction hint"):
            m.attach_hint(db, self.hint(transaction="0x" + "ff" * 32))
        self.assertEqual(m.inspect(db, candidate()["paymentNonce"])[
            "unverifiedTransactionHint"]["transaction_hash"], self.hint()["transaction"])
        self.assertEqual(db.execute("SELECT count(*) FROM transaction_hints").fetchone()[0], 1)

    def test_cli_hint_and_lost_ack_stay_reconcile_only(self):
        env = os.environ.copy()
        env["AGENTLEDGER_CHARGE_DB"] = str(self.path)
        self.assertEqual(m.reserve(self.db(), candidate())["result"], "RESERVED_FIRST_ATTEMPT")
        cmd = [sys.executable, str(SCRIPT), "attach-hint"]
        saved = subprocess.run(cmd, input=json.dumps(self.hint()), text=True,
                               capture_output=True, timeout=10, env=env)
        self.assertEqual(saved.returncode, 0, saved.stderr)
        result = json.loads(saved.stdout)
        self.assertFalse(result["chargeAgain"])
        self.assertEqual(result["paymentStatus"], "PaymentUnknown")
        inspected = subprocess.run([sys.executable, str(SCRIPT), "inspect",
                                    candidate()["paymentNonce"]],
                                   capture_output=True, text=True, timeout=10, env=env)
        self.assertEqual(inspected.returncode, 0, inspected.stderr)
        self.assertEqual(json.loads(inspected.stdout)["unverifiedTransactionHint"][
            "transaction_hash"], self.hint()["transaction"])
        self.assertEqual(m.reserve(self.db(), candidate())["result"],
                         "BLOCKED_EXISTING_ATTEMPT_NO_RECHARGE")

    def test_callback_concurrency_keeps_single_hint(self):
        self.assertEqual(m.reserve(self.db(), candidate())["result"], "RESERVED_FIRST_ATTEMPT")
        env = os.environ.copy()
        env["AGENTLEDGER_CHARGE_DB"] = str(self.path)
        def attach(_):
            return subprocess.run([sys.executable, str(SCRIPT), "attach-hint"],
                                  input=json.dumps(self.hint()), text=True,
                                  capture_output=True, timeout=10, env=env)
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            outputs = list(pool.map(attach, range(8)))
        self.assertTrue(all(x.returncode == 0 for x in outputs), [x.stderr for x in outputs])
        labels = [json.loads(x.stdout)["result"] for x in outputs]
        self.assertEqual(labels.count("TX_HINT_STORED_UNVERIFIED"), 1)
        self.assertEqual(labels.count("TX_HINT_ALREADY_PRESENT"), 7)
        self.assertEqual(self.db().execute("SELECT count(*) FROM transaction_hints").fetchone()[0], 1)


    def test_readonly_inspection_never_creates_missing_db(self):
        self.assertFalse(self.path.exists())
        with self.assertRaisesRegex(ValueError, "database unavailable"):
            m.connect_readonly(self.path)
        self.assertFalse(self.path.exists())

    def test_readonly_inspection_supports_hint_and_legacy_db(self):
        db = self.db()
        m.reserve(db, candidate())
        nonce = candidate()["paymentNonce"]
        with m.connect_readonly(self.path) as reader:
            data = m.inspect(reader, nonce)
            self.assertIsNone(data["unverifiedTransactionHint"])
            with self.assertRaises(sqlite3.OperationalError):
                reader.execute("UPDATE charge_attempts SET status='RESERVED_RECONCILE_ONLY'")
        # Upgrade/migrate a legacy DB without attaching a hint in read-only mode.
        db.execute("DROP TABLE transaction_hints")
        with m.connect_readonly(self.path) as reader:
            self.assertIsNone(m.inspect(reader, nonce)["unverifiedTransactionHint"])
        db.execute(m.HINT_DDL)
        m.attach_hint(db, self.hint())
        with m.connect_readonly(self.path) as reader:
            self.assertEqual(m.inspect(reader, nonce)["unverifiedTransactionHint"][
                "transaction_hash"], self.hint()["transaction"])

if __name__ == "__main__":
    unittest.main()
