"""CRM and sales pipeline management package."""
from .pipeline import CRMPipeline, PipelineStage, StageTransition, CRMRecord

__all__ = ["CRMPipeline", "PipelineStage", "StageTransition", "CRMRecord"]
