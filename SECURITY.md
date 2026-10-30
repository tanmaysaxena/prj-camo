# Security policy

Camo is a design-token compiler and a source scanner. It reads local files and writes CSS; it makes no network calls and
runs no code from the projects it reads.

If you find a vulnerability (for example a config value that makes `camo compile` emit CSS that escapes its declaration,
or a path traversal in the CLI), please report it privately through
[GitHub private vulnerability reporting](https://github.com/tanmaysaxena/prj-camo/security/advisories/new) rather than
opening a public issue. You will get a reply within a week.
