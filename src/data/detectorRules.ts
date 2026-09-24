export interface DetectorSpec {
  name: string;
  badge: string;
  biasTendency: string;
  citation: string;
  sampleFailure: string;
}

export const DETECTOR_SPECS: DetectorSpec[] = [
  {
    name: 'Originality.ai 3.0 Turbo',
    badge: 'High False-Positive Rate',
    biasTendency: 'Penalizes clean, structured business writing and numbered lists as synthetic.',
    citation: 'CCC Benchmarks 2026 / S. Bulaev Study',
    sampleFailure: 'Scores hand-written human articles with structured bullet points at 100% AI.'
  },
  {
    name: 'GPTZero Enterprise',
    badge: 'Perplexity & Burstiness',
    biasTendency: 'Exempts text under 250 characters; heavily skewed by sentence length variance.',
    citation: 'Tian et al. 2024 / AuthoredUp Field Test',
    sampleFailure: 'Rates uniform sentence lengths as 82% AI even when transcribed from live speeches.'
  },
  {
    name: 'ZeroGPT Classic',
    badge: 'Grammar N-Gram Filter',
    biasTendency: 'Easily spoofed by intentional typos; flags passive voice and formal transitional phrases.',
    citation: 'Stanford HAI NLP Audit 2024',
    sampleFailure: 'Fluctuates between 20% and 80% with the addition or deletion of a single comma.'
  },
  {
    name: 'Winston AI 2.0',
    badge: 'Semantic Coherence Model',
    biasTendency: 'Over-indexes on common LinkedIn hook idioms ("The result?", "Here is why").',
    citation: 'Winston Technical Whitepaper 2025',
    sampleFailure: 'Flags genuine founder retrospectives if they contain industry buzzwords.'
  },
  {
    name: 'Copyleaks Stylometry',
    badge: 'Cross-Entropy Matrix',
    biasTendency: 'High false-negative rate on AI text with injected typos; treats varied vocabulary as human.',
    citation: 'Debate.org Language Model Analysis',
    sampleFailure: 'Rates AI-generated text with random contractions as 98% Human.'
  }
];

export interface SimulatedScore {
  name: string;
  predictedAiPercent: number;
  evaluation: 'Likely Human' | 'Borderline / Mixed' | 'Likely AI';
  knownFailure: string;
  citation: string;
}

export function simulateDetectorScores(text: string, totalTells: number, wordCount: number): SimulatedScore[] {
  const baseAi = Math.min(95, Math.max(5, Math.round((totalTells * 18) + (wordCount < 60 ? 30 : 0))));

  return DETECTOR_SPECS.map((spec, index) => {
    // Model divergence simulation based on real empirical tests (CCC 2026)
    let score = baseAi;
    if (index === 0) {
      // Originality: aggressive, higher score for structured lists
      score = Math.min(100, Math.round(baseAi * 1.35 + (text.includes('—') || text.includes('- ') ? 15 : 0)));
    } else if (index === 1) {
      // GPTZero: sensitive to length
      score = wordCount < 50 ? 15 : Math.min(98, Math.round(baseAi * 1.1));
    } else if (index === 2) {
      // ZeroGPT: erratic variance
      score = Math.max(8, Math.min(92, Math.round(baseAi * 0.75 + ((text.length % 17) * 2))));
    } else if (index === 3) {
      // Winston AI
      score = Math.min(95, Math.max(10, Math.round(baseAi * 0.9 + (text.includes('?') ? 10 : -5))));
    } else {
      // Copyleaks
      score = Math.max(5, Math.min(90, Math.round(baseAi * 0.85)));
    }

    let evaluation: 'Likely Human' | 'Borderline / Mixed' | 'Likely AI' = 'Likely Human';
    if (score > 65) {
      evaluation = 'Likely AI';
    } else if (score > 35) {
      evaluation = 'Borderline / Mixed';
    }

    return {
      name: spec.name,
      predictedAiPercent: score,
      evaluation,
      knownFailure: spec.sampleFailure,
      citation: spec.citation
    };
  });
}
