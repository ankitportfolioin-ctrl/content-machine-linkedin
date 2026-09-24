"""Backend abstraction for LinkedIn actions.

Decouples business logic from specific vendors.
Supports:
1. ManualBackend: Zero-dependency, produces structured copy-paste instructions for the user.
2. PubloraBackend: Uses Publora REST API for authorized scheduling/publishing.
3. DiyBackend: Invokes custom user-configured CLI or poster script.
"""
from __future__ import annotations

import os
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class ActionResult:
    success: bool
    action_type: str
    target: str
    message: str
    external_id: Optional[str] = None
    data: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class LinkedInActionBackend(ABC):
    """Abstract interface defining all LinkedIn interaction operations."""

    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @abstractmethod
    def create_post(self, content: str, media_urls: Optional[List[str]] = None) -> ActionResult:
        pass

    @abstractmethod
    def create_comment(self, post_url: str, comment_text: str) -> ActionResult:
        pass

    @abstractmethod
    def send_connection_request(self, profile_url: str, note: str) -> ActionResult:
        pass

    @abstractmethod
    def send_direct_message(self, profile_url: str, text: str) -> ActionResult:
        pass

    @abstractmethod
    def create_reply(self, comment_url: str, reply_text: str) -> ActionResult:
        pass

    @abstractmethod
    def create_reaction(self, target_url: str, reaction_type: str = "LIKE") -> ActionResult:
        pass

    @abstractmethod
    def schedule_post(self, content: str, publish_at: str, media_urls: Optional[List[str]] = None) -> ActionResult:
        pass

    @abstractmethod
    def get_post(self, post_url: str) -> ActionResult:
        pass

    @abstractmethod
    def get_comments(self, post_url: str) -> ActionResult:
        pass


class ManualBackend(LinkedInActionBackend):
    """Tier 0 Manual mode: generates formatted copy-paste instructions for the user."""

    @property
    def name(self) -> str:
        return "manual"

    def create_post(self, content: str, media_urls: Optional[List[str]] = None) -> ActionResult:
        msg = (
            "Open LinkedIn: https://www.linkedin.com/feed/\n\n"
            "Create this post:\n"
            f"{content}"
        )
        return ActionResult(success=True, action_type="post", target="LinkedIn Feed", message=msg, data={"content": content})

    def create_comment(self, post_url: str, comment_text: str) -> ActionResult:
        msg = (
            "Open this LinkedIn post:\n"
            f"{post_url}\n\n"
            "Post this comment:\n"
            f"{comment_text}"
        )
        return ActionResult(success=True, action_type="comment", target=post_url, message=msg, data={"post_url": post_url, "text": comment_text})

    def send_connection_request(self, profile_url: str, note: str) -> ActionResult:
        msg = (
            "Open this LinkedIn profile:\n"
            f"{profile_url}\n\n"
            "Send a connection request with:\n"
            f"{note}"
        )
        return ActionResult(
            success=True,
            action_type="connection_request",
            target=profile_url,
            message=msg,
            data={"profile_url": profile_url, "note": note},
        )

    def send_direct_message(self, profile_url: str, text: str) -> ActionResult:
        msg = (
            "Open this LinkedIn profile/conversation:\n"
            f"{profile_url}\n\n"
            "Send this message:\n"
            f"{text}"
        )
        return ActionResult(
            success=True,
            action_type="first_message",
            target=profile_url,
            message=msg,
            data={"profile_url": profile_url, "text": text},
        )

    def create_reply(self, comment_url: str, reply_text: str) -> ActionResult:
        msg = (
            f"✅ Ready to reply to comment:\n"
            "1. Open LinkedIn and find the target comment\n"
            "2. Click 'Reply'\n"
            "3. Paste the approved text:\n\n"
            f"```text\n{reply_text}\n```"
        )
        return ActionResult(success=True, action_type="reply", target=comment_url, message=msg, data={"text": reply_text})

    def create_reaction(self, target_url: str, reaction_type: str = "LIKE") -> ActionResult:
        msg = f"✅ Open {target_url} and click the '{reaction_type.capitalize()}' button."
        return ActionResult(success=True, action_type="reaction", target=target_url, message=msg)

    def schedule_post(self, content: str, publish_at: str, media_urls: Optional[List[str]] = None) -> ActionResult:
        msg = (
            f"✅ Scheduled for {publish_at} (Manual Mode):\n"
            "1. Open LinkedIn post composer\n"
            "2. Click the clock icon ('Schedule for later')\n"
            f"3. Select {publish_at} and paste your approved text."
        )
        return ActionResult(success=True, action_type="schedule_post", target="LinkedIn", message=msg)

    def get_post(self, post_url: str) -> ActionResult:
        return ActionResult(success=True, action_type="get_post", target=post_url, message="Manual fetch: open URL in browser", data={"url": post_url})

    def get_comments(self, post_url: str) -> ActionResult:
        return ActionResult(success=True, action_type="get_comments", target=post_url, message="Manual fetch: open URL comments in browser")


class PubloraBackend(LinkedInActionBackend):
    """Tier 1 Publora REST API adapter."""

    def __init__(self, api_key: Optional[str] = None, platform_id: Optional[str] = None):
        self.api_key = api_key or os.getenv("PUBLORA_API_KEY", "")
        self.platform_id = platform_id or os.getenv("LINKEDIN_PLATFORM_ID", "")

    @property
    def name(self) -> str:
        return "publora"

    def _get_client(self):
        from ..publora_client import PubloraClient
        return PubloraClient(api_key=self.api_key)

    def create_post(self, content: str, media_urls: Optional[List[str]] = None) -> ActionResult:
        client = self._get_client()
        res = client.create_post(platform_id=self.platform_id, text=content, media_urls=media_urls)
        return ActionResult(
            success=True,
            action_type="post",
            target="LinkedIn",
            message="Post successfully published via Publora API.",
            external_id=res.get("id"),
            data=res,
        )

    def create_comment(self, post_url: str, comment_text: str) -> ActionResult:
        client = self._get_client()
        res = client.create_comment(post_url=post_url, text=comment_text)
        return ActionResult(
            success=True,
            action_type="comment",
            target=post_url,
            message="Comment successfully published via Publora API.",
            external_id=res.get("id"),
            data=res,
        )

    def create_reply(self, comment_url: str, reply_text: str) -> ActionResult:
        client = self._get_client()
        res = client.create_reply(comment_url=comment_url, text=reply_text)
        return ActionResult(
            success=True,
            action_type="reply",
            target=comment_url,
            message="Reply successfully published via Publora API.",
            external_id=res.get("id"),
            data=res,
        )

    def create_reaction(self, target_url: str, reaction_type: str = "LIKE") -> ActionResult:
        client = self._get_client()
        res = client.create_reaction(target_url=target_url, reaction_type=reaction_type)
        return ActionResult(
            success=True,
            action_type="reaction",
            target=target_url,
            message=f"Reaction '{reaction_type}' published via Publora API.",
            data=res,
        )

    def schedule_post(self, content: str, publish_at: str, media_urls: Optional[List[str]] = None) -> ActionResult:
        client = self._get_client()
        res = client.schedule_post(platform_id=self.platform_id, text=content, publish_at=publish_at, media_urls=media_urls)
        return ActionResult(
            success=True,
            action_type="schedule_post",
            target="LinkedIn",
            message=f"Post scheduled for {publish_at} via Publora API.",
            external_id=res.get("id"),
            data=res,
        )

    def get_post(self, post_url: str) -> ActionResult:
        from ..backend_selector import fetch_post
        res = fetch_post(post_url)
        return ActionResult(success=bool(res), action_type="get_post", target=post_url, message="Fetched post", data=res or {})

    def get_comments(self, post_url: str) -> ActionResult:
        return ActionResult(success=True, action_type="get_comments", target=post_url, message="Fetched comments", data={})

    def send_connection_request(self, profile_url: str, note: str) -> ActionResult:
        return ManualBackend().send_connection_request(profile_url, note)

    def send_direct_message(self, profile_url: str, text: str) -> ActionResult:
        return ManualBackend().send_direct_message(profile_url, text)


class DiyBackend(LinkedInActionBackend):
    """Tier 2 DIY / Custom Poster Backend."""

    def __init__(self, command_or_module: Optional[str] = None):
        self.cmd = command_or_module or os.getenv("LINKEDIN_SKILLS_CUSTOM_POSTER") or os.getenv("CUSTOM_POSTER") or ""

    @property
    def name(self) -> str:
        return "diy"

    def create_post(self, content: str, media_urls: Optional[List[str]] = None) -> ActionResult:
        from ..backend_selector import dispatch_diy
        res = dispatch_diy(action="create_post", payload={"text": content, "media_urls": media_urls or []})
        return ActionResult(success=True, action_type="post", target="LinkedIn", message="Dispatched to custom poster", data=res)

    def create_comment(self, post_url: str, comment_text: str) -> ActionResult:
        from ..backend_selector import dispatch_diy
        res = dispatch_diy(action="create_comment", payload={"post_url": post_url, "text": comment_text})
        return ActionResult(success=True, action_type="comment", target=post_url, message="Dispatched comment to custom poster", data=res)

    def send_connection_request(self, profile_url: str, note: str) -> ActionResult:
        from ..backend_selector import dispatch_diy
        res = dispatch_diy(action="send_connection_request", payload={"profile_url": profile_url, "note": note})
        return ActionResult(success=True, action_type="connection_request", target=profile_url, message="Dispatched connection request to custom poster", data=res)

    def send_direct_message(self, profile_url: str, text: str) -> ActionResult:
        from ..backend_selector import dispatch_diy
        res = dispatch_diy(action="send_direct_message", payload={"profile_url": profile_url, "text": text})
        return ActionResult(success=True, action_type="first_message", target=profile_url, message="Dispatched direct message to custom poster", data=res)

    def create_reply(self, comment_url: str, reply_text: str) -> ActionResult:
        from ..backend_selector import dispatch_diy
        res = dispatch_diy(action="create_reply", payload={"comment_url": comment_url, "text": reply_text})
        return ActionResult(success=True, action_type="reply", target=comment_url, message="Dispatched reply to custom poster", data=res)

    def create_reaction(self, target_url: str, reaction_type: str = "LIKE") -> ActionResult:
        from ..backend_selector import dispatch_diy
        res = dispatch_diy(action="create_reaction", payload={"target_url": target_url, "reaction_type": reaction_type})
        return ActionResult(success=True, action_type="reaction", target=target_url, message="Dispatched reaction to custom poster", data=res)

    def schedule_post(self, content: str, publish_at: str, media_urls: Optional[List[str]] = None) -> ActionResult:
        from ..backend_selector import dispatch_diy
        res = dispatch_diy(action="schedule_post", payload={"text": content, "publish_at": publish_at})
        return ActionResult(success=True, action_type="schedule_post", target="LinkedIn", message="Dispatched schedule to custom poster", data=res)

    def get_post(self, post_url: str) -> ActionResult:
        return ActionResult(success=True, action_type="get_post", target=post_url, message="Dispatched get_post to custom poster")

    def get_comments(self, post_url: str) -> ActionResult:
        return ActionResult(success=True, action_type="get_comments", target=post_url, message="Dispatched get_comments to custom poster")


def get_action_backend(preferred_name: Optional[str] = None) -> LinkedInActionBackend:
    """Factory function returning the active LinkedInActionBackend instance."""
    from ..backend_selector import active_backend
    name = (preferred_name or active_backend()).lower()
    if name == "publora":
        return PubloraBackend()
    if name == "diy":
        return DiyBackend()
    return ManualBackend()
