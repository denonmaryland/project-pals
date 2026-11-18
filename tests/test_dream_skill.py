"""Dream skill proposals keep the reviewed skill's metadata and body."""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APPLY = '''
import importlib.machinery, importlib.util, json, sys
loader = importlib.machinery.SourceFileLoader("crew_cli_dream_test", sys.argv[1])
crew = importlib.util.module_from_spec(importlib.util.spec_from_loader(loader.name, loader))
loader.exec_module(crew)
crew.apply_dream([], json.loads(sys.argv[2]))
'''


class DreamSkillTest(unittest.TestCase):
    def apply(self, temp, proposal):
        env = {**os.environ, "HOME": temp, "CREW_DATA": str(Path(temp) / "data"),
               "PYTHONPATH": str(ROOT / "bin")}
        subprocess.run([sys.executable, "-c", APPLY, str(ROOT / "bin" / "crew"), json.dumps(proposal)],
                       env=env, check=True, capture_output=True, text=True)
        return Path(temp) / "data" / "crew-skills"

    def test_apply_uses_normalized_name_and_description_only(self):
        source = '---\nname: Film Render\ndescription: "Render long films safely"\nallowed-tools: Bash\nhooks: dangerous\nversion: 1\n---\n\n# Instructions\nDo the thing.\n'
        proposal = {"meta": {"kind": "skill", "name": "other", "summary": "summary"},
                    "note": "why this was proposed", "text": source}
        with tempfile.TemporaryDirectory() as temp:
            root = self.apply(temp, proposal)
            content = (root / "film-render" / "SKILL.md").read_text()
            self.assertIn('name: film-render\n', content)
            self.assertIn('description: "Render long films safely"\n', content)
            self.assertIn('saved-by: "dream"\n', content)
            self.assertIn('# Instructions\nDo the thing.', content)
            self.assertNotIn('allowed-tools:', content)
            self.assertNotIn('hooks:', content)
            self.assertNotIn('version:', content)
            self.assertEqual(content.count('---'), 2)
            self.assertFalse((root / "other").exists())

    def test_plain_body_uses_proposal_name_and_note(self):
        proposal = {"meta": {"kind": "skill", "name": "plain", "summary": "summary"},
                    "note": "explanation", "text": "# Instructions\nDo the thing.\n"}
        with tempfile.TemporaryDirectory() as temp:
            content = (self.apply(temp, proposal) / "plain" / "SKILL.md").read_text()
            self.assertIn('description: "explanation"', content)
            self.assertIn("# Instructions\nDo the thing.", content)
            self.assertEqual(content.count("---"), 2)

    def test_partial_frontmatter_uses_fallback_without_nesting(self):
        proposal = {"meta": {"kind": "skill", "name": "fallback", "summary": "summary"},
                    "note": "explanation", "text": "---\nname: from-file\n---\n\n# Instructions\n"}
        with tempfile.TemporaryDirectory() as temp:
            content = (self.apply(temp, proposal) / "from-file" / "SKILL.md").read_text()
            self.assertIn('description: "explanation"', content)
            self.assertEqual(content.count("---"), 2)


if __name__ == "__main__":
    unittest.main()
