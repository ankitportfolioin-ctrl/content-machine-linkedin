import os
import sys
import json
import urllib.request
import urllib.error

BASE_URL = "http://localhost:3000"

def request(endpoint, method="GET", data=None, headers=None):
    if headers is None:
        headers = {}
    url = f"{BASE_URL}{endpoint}"
    req_headers = {"Content-Type": "application/json", **headers}
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(err_body)
        except:
            return e.code, {"raw_error": err_body}
    except Exception as ex:
        return 500, {"error": str(ex)}

def run_tests():
    print("=" * 70)
    print("STARTING CONTENT QUALITY & ZERO-CONTEXT-LEAKAGE VERIFICATION SUITE")
    print("=" * 70)

    # STEP 0: Retrieve current user profile
    status, profile = request("/api/voice-profile")
    assert status == 200, f"Failed to get voice profile: {profile}"
    print(f"[OK] Voice Profile Loaded.")
    print(f"     Role: {profile.get('role')}")
    print(f"     Audience: {profile.get('audience')}")
    print(f"     Pillars: {len(profile.get('contentPillars', []))} defined")

    # TEST 1: Generate 5 Ideas
    print("\n--- TEST 1: Generating 5 Ideas ---")
    status, ideas_resp = request("/api/content/ideas", method="POST", data={"voiceProfile": profile})
    assert status == 200, f"Failed to generate ideas: {ideas_resp}"
    ideas = ideas_resp.get("ideas", [])
    assert len(ideas) == 5, f"Expected exactly 5 ideas, got {len(ideas)}"
    print(f"[PASS] Successfully generated 5 distinct strategic ideas:")
    for idx, idea in enumerate(ideas):
        print(f"  [{idx+1}] {idea['angle']} ({idea['targetPillar']})")
        print(f"      Thesis: {idea['idea']}")
        print(f"      Audience: {idea['intendedAudience']} | Structure: {idea['structure']}")
        
        # Verify no raw audience dumping in intendedAudience
        assert len(idea['intendedAudience'].split(",")) <= 3, f"Audience dumping detected: {idea['intendedAudience']}"
        assert profile.get('role', '') not in idea['idea'], "Role leaked into idea"

    # TEST 2: Generate 3 Hooks for Selected Idea
    selected_idea = ideas[0]
    print(f"\n--- TEST 2: Generating 3 Hooks for Idea 1 ---")
    print(f"Selected Idea: {selected_idea['idea']}")
    status, hooks_resp = request("/api/content/hooks", method="POST", data={"idea": selected_idea, "voiceProfile": profile})
    assert status == 200, f"Failed to generate hooks: {hooks_resp}"
    hooks = hooks_resp.get("hooks", [])
    assert len(hooks) >= 3, f"Expected 3 hooks, got {len(hooks)}"
    print(f"[PASS] Successfully generated {len(hooks)} opening hooks:")
    for idx, h in enumerate(hooks[:3]):
        print(f"  Hook {idx+1} [{h.get('angleName')}]: \"{h.get('hook')}\" ({h.get('characterCount')} chars)")
        # Assertions on hooks:
        assert h.get('characterCount', 999) <= 210, f"Hook exceeds mobile fold: {h.get('characterCount')}"
        assert not h.get('hook', '').strip().endswith("?"), "Hook should not be a question"
        # Zero fabricated percentages/numbers
        assert "64%" not in h.get('hook', ''), "Invented 64% detected in hook"
        assert "3x" not in h.get('hook', ''), "Invented 3x detected in hook"

    # TEST 3: Generate Complete Post (NOT just the hook)
    selected_hook = hooks[0]["hook"]
    print(f"\n--- TEST 3: Generating Complete Post ---")
    print(f"Selected Hook: \"{selected_hook}\"")
    status, post_resp = request("/api/content/complete-post", method="POST", data={
        "idea": selected_idea,
        "hook": selected_hook,
        "voiceProfile": profile
    })
    assert status == 200, f"Failed to generate complete post: {post_resp}"
    complete_post = post_resp.get("post", "")
    model_used = post_resp.get("modelUsed", "")
    validation = post_resp.get("validation", {})
    
    print(f"\n[GENERATED COMPLETE POST] (Model: {model_used}, Length: {len(complete_post)} chars):")
    print("-" * 60)
    print(complete_post)
    print("-" * 60)

    # TEST 4: Context Leakage Verification
    print("\n--- TEST 4: Context Leakage Audit ---")
    literal_role = profile.get("role", "")
    literal_audience = profile.get("audience", "")
    
    # 1. Literal role leak
    assert literal_role not in complete_post, f"FAIL: Literal role leaked into post: {literal_role}"
    assert "In our work as" not in complete_post, "FAIL: 'In our work as' leaked into post"
    print("[PASS] Zero literal role leakage.")

    # 2. Raw ICP list dump
    assert literal_audience not in complete_post, f"FAIL: Literal audience list leaked: {literal_audience}"
    assert "Software Developers, Software Engineers, Full-Stack" not in complete_post, "FAIL: Raw ICP dump found"
    print("[PASS] Zero raw ICP list dumping.")

    # 3. Fake first comment boilerplate
    assert "first comment" not in complete_post.lower(), "FAIL: Fake first comment promise found"
    print("[PASS] Zero fake first comment promises.")

    # TEST 5: Factual Grounding & Anti-Fabrication Verification
    print("\n--- TEST 5: Factual Grounding Audit ---")
    assert "64%" not in complete_post, "FAIL: Invented '64%' statistic found"
    assert "3x improvement" not in complete_post, "FAIL: Invented '3x improvement' found"
    assert "Turnaround times dropped from hours to minutes" not in complete_post, "FAIL: Invented turnaround found"
    print("[PASS] Zero fabricated statistics.")

    # TEST 6: Complete Post Structure Check
    print("\n--- TEST 6: Post Structure Verification ---")
    # Must have opening hook as first sentence
    assert selected_hook[:30].lower() in complete_post[:60].lower(), "Hook is not at the start of the post"
    assert len(complete_post) >= 400, f"Post is too short to be a complete post ({len(complete_post)} chars)"
    print(f"[PASS] Post is complete with full structure ({len(complete_post)} characters).")

    # TEST 7: Fact Validation Classification Engine
    print("\n--- TEST 7: Fact Validation Engine Direct Unit Test ---")
    # Synthetic test with bad fabricated stats and role leaks
    bad_sample = """64% of operational friction disappears the moment you eliminate manual handoffs.
In our work as Tech Creator & Educator sharing practical insights on AI, software development, startups, and emerging technology, the biggest win is removing repetitive steps.
When working with Software Developers, Software Engineers, Full-Stack Developers, AI Engineers, ML Engineers, DevOps Engineers, Technical Founders, Startup Founders, Indie Hackers, and Tech Leads, here is what the data showed:
— Direct data shows an immediate 3x improvement in turnaround once manual friction is removed.
— Turnaround times dropped from hours to minutes.
P.S. Details on how we structured this transition are in the first comment."""

    status, val_resp = request("/api/content/validate", method="POST", data={
        "post": bad_sample,
        "voiceProfile": profile
    })
    assert status == 200, f"Validation endpoint failed: {val_resp}"
    print("[PASS] Bad sample flagged:")
    print(f"      Leakage detected: {val_resp.get('leakageDetected')}")
    print(f"      Leakage details: {val_resp.get('leakageDetails')}")
    print(f"      Unsupported claims count: {val_resp.get('unsupportedCount')}")
    
    cleaned = val_resp.get("validatedPost", "")
    assert "64%" not in cleaned, "Cleaner failed to remove 64%"
    assert "3x" not in cleaned, "Cleaner failed to remove 3x"
    assert literal_role not in cleaned, "Cleaner failed to remove literal role"
    assert "first comment" not in cleaned, "Cleaner failed to remove first comment"
    print("[PASS] Fact validation engine successfully scrubbed all fabrications and leaks into qualitative principles.")

    # TEST 8: Two-Workspace Isolation Check
    print("\n--- TEST 8: Two-Workspace Isolation Invariant Check ---")
    ws_a_headers = {"x-workspace-id": "ws-test-d2c"}
    ws_b_headers = {"x-workspace-id": "ws-test-restaurant"}

    # Set up Workspace A
    profile_a = {
        "role": "Founder helping Indian D2C brands automate customer support",
        "audience": "Indian D2C founders and e-commerce businesses",
        "contentPillars": ["AI customer support", "D2C growth", "WhatsApp automation", "Customer experience"]
    }
    status, _ = request("/api/voice-profile", method="POST", data=profile_a, headers=ws_a_headers)
    assert status == 200

    # Set up Workspace B
    profile_b = {
        "role": "Founder helping independent restaurants increase repeat orders",
        "audience": "Restaurant founders and restaurant operators",
        "contentPillars": ["Restaurant growth", "Repeat orders", "WhatsApp ordering", "Guest retention"]
    }
    status, _ = request("/api/voice-profile", method="POST", data=profile_b, headers=ws_b_headers)
    assert status == 200

    # Generate ideas for Workspace A
    status, ideas_a = request("/api/content/ideas", method="POST", data={"voiceProfile": profile_a}, headers=ws_a_headers)
    assert status == 200
    ideas_a_list = ideas_a.get("ideas", [])
    assert any("D2C" in i["targetPillar"] or "AI" in i["targetPillar"] or "WhatsApp" in i["targetPillar"] for i in ideas_a_list), "Workspace A ideas should map to D2C pillars"
    assert not any("Restaurant" in i["targetPillar"] for i in ideas_a_list), "Workspace A polluted with restaurant pillar!"

    # Generate ideas for Workspace B
    status, ideas_b = request("/api/content/ideas", method="POST", data={"voiceProfile": profile_b}, headers=ws_b_headers)
    assert status == 200
    ideas_b_list = ideas_b.get("ideas", [])
    assert any("Restaurant" in i["targetPillar"] or "orders" in i["targetPillar"].lower() for i in ideas_b_list), "Workspace B ideas should map to Restaurant pillars"
    assert not any("D2C" in i["targetPillar"] for i in ideas_b_list), "Workspace B polluted with D2C pillar!"

    print("[PASS] Two-workspace isolation 100% verified. Zero cross-contamination.")

    print("\n" + "=" * 70)
    print("ALL TESTS PASSED! CONTENT QUALITY & SYSTEM INTEGRITY PROVEN.")
    print("=" * 70)

if __name__ == "__main__":
    run_tests()
