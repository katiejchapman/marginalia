# Git hooks (tracked)

`post-commit` auto-appends each commit's subject to
`.claude/completions/completions.md` (idempotent per hash; the appended line is
picked up by your next commit). Git has no client-side *post-push* hook, so
post-commit is the closest reliable trigger.

These hooks are version-controlled but **git does not use a tracked hooks dir by
default**. After cloning, run once:

```sh
git config core.hooksPath .claude/hooks
```

(`core.hooksPath` replaces `.git/hooks` entirely — put any other hooks here too.)
