import unittest

from account_input import parse_accounts


class ParseAccountsTest(unittest.TestCase):
    outlook = "outlook@example.com----password----client-id----refresh-token"

    def test_parses_newline_and_semicolon_separated_accounts(self) -> None:
        accounts = parse_accounts(f"{self.outlook}\n; {self.outlook}")
        self.assertEqual(len(accounts), 2)
        self.assertEqual(accounts[0][0], "outlook@example.com")

    def test_preserves_duplicate_accounts(self) -> None:
        self.assertEqual(len(parse_accounts(f"{self.outlook};{self.outlook}")), 2)

    def test_rejects_non_outlook_field_count(self) -> None:
        with self.assertRaisesRegex(ValueError, "Outlook 4 字段"):
            parse_accounts("outlook@example.com----api-key")

    def test_rejects_empty_input(self) -> None:
        with self.assertRaisesRegex(ValueError, "不能为空"):
            parse_accounts("\n; ;\r\n")


if __name__ == "__main__":
    unittest.main()