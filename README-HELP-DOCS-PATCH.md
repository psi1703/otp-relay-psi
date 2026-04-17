# Help Docs patch contents

This bundle adds:
- `docs/help/*.md` topic files
- `docs/help/assets/README.md`
- `scripts/build_help_docs.py`
- `.github/workflows/deploy-help-docs.yml`
- `frontend/help/README.md`

## Next steps

1. Copy these files into your repo.
2. Add screenshots into `docs/help/assets/`.
3. Install Python deps locally if you want to test:
   - `pip install markdown pyyaml`
4. Run:
   - `python scripts/build_help_docs.py`
5. Update `HelpView` in `frontend/app.jsx` to fetch `/help/manifest.json`.
6. Add GitHub secrets:
   - `PI_HOST`
   - `PI_USER`
   - `PI_SSH_PRIVATE_KEY`
