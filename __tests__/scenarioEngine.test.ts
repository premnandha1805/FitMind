import { item } from './fixtures';
import { AdvisorResponse, ScenarioContext, buildAdvisorResponse, filterClosetForScenario, handleVideoCallMode } from '../src/services/scenarioEngine';

const baseContext: ScenarioContext = {
  event_type: 'job interview',
  industry_context: 'finance',
  formality: 8,
  setting: 'indoor',
  culture_context: 'general',
  weather_relevant: false,
  upper_body_only: false,
  time_of_day: 'morning',
  avoid_colors: [],
  priority_attributes: [],
  occasion_category: 'professional',
  power_level: 'authoritative',
  confidence_tip: 'Keep posture open.',
  dress_code: 'business formal',
  missing_item_suggestions: ['structured blazer'],
  styling_notes: 'Keep it sharp.',
};

describe('scenarioEngine', () => {
  test('filterClosetForScenario applies occasion and formality filters', () => {
    const closet = [
      item({ id: 'formal-top', category: 'top', styleType: 'professional' }),
      item({ id: 'casual-top', category: 'top', styleType: 'casual' }),
      item({ id: 'formal-bottom', category: 'bottom', styleType: 'formal' }),
    ];

    const filtered = filterClosetForScenario(baseContext, closet);
    expect(filtered.items.map((piece) => piece.id)).toContain('formal-top');
    expect(filtered.items.map((piece) => piece.id)).not.toContain('casual-top');
  });

  test('filterClosetForScenario flags video-call mode', () => {
    const filtered = filterClosetForScenario({ ...baseContext, setting: 'video_call', upper_body_only: true }, []);
    expect(filtered.note).toMatch(/Video call/);
  });

  test('buildAdvisorResponse removes missing items already represented in closet', () => {
    const response = buildAdvisorResponse(
      { outfit: null, candidate: null, closestOutfit: null, closestCandidate: null },
      { ...baseContext, missing_item_suggestions: ['top', 'structured blazer'] },
      [item({ category: 'top' })]
    );

    expect(response.missingItems).not.toContain('top');
    expect(response.missingItems).toContain('structured blazer');
    expect(response.confidenceTip).toBe(baseContext.confidence_tip);
  });

  test('handleVideoCallMode currently preserves response identity', () => {
    const response = { videoCallMode: true } as AdvisorResponse;
    expect(handleVideoCallMode(response)).toBe(response);
  });
});
