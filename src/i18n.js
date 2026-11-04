const STRINGS = {
  en: {
    merged: 'merged', closed: 'closed', draft: 'draft', conflict: 'merge conflict',
    ci_failed: 'CI failed', ci_running: 'CI running', changes: 'changes requested',
    comments: (n) => `${n} open comment${n === 1 ? '' : 's'}`,
    ai_running: 'AI reviewing', review_wait: 'waiting for review', behind: 'behind base', blocked: 'blocked by rules', ready: 'ready to merge',
    ci: 'CI', review: 'Review', no_ci: 'no CI', ago: (t) => `${t} ago`, for: (t) => `for ${t}`, waiting: 'waiting', none: 'none', not_required: 'not required', approved: 'approved', pr_opened: 'PR opened', merge: 'Merge', progress: 'PROGRESS', agent: 'AGENT', files: 'FILES', no_agent: 'no agent connected', no_files: 'No file changes.', no_log: 'No failed log.', loading: 'Loading...',
    a_working: 'working', a_idle: 'idle', a_done: 'idle', a_blocked: 'waiting for input', a_unknown: 'unknown',
    list_title: 'PRs', count: (n) => `${n} open`, synced: (t) => `${t} ago`, empty_title: 'No PRs yet', empty_body: 'PRs your agents open in Herdr appear here on their own.',
    k_open: 'details', k_agent: 'go to agent', k_refresh: 'refresh', k_quit: 'close', k_back: 'back', k_log: 'CI log', k_diff: 'changes', k_web: 'GitHub', k_scroll: 'scroll', k_file: 'file', no_agent_msg: 'No agent is running for this PR.', log_title: 'Failed CI log', diff_title: 'Changes',
  },
  ko: {
    merged: '머지됨', closed: '닫힘', draft: '초안', conflict: '머지 충돌',
    ci_failed: 'CI 실패', ci_running: 'CI 실행 중', changes: '변경 요청됨',
    comments: (n) => `코멘트 ${n}건`,
    ai_running: 'AI 리뷰 중', review_wait: '리뷰 대기', behind: '기준 브랜치보다 뒤처짐', blocked: '브랜치 규칙에 막힘', ready: '머지 가능',
    ci: 'CI', review: '리뷰', no_ci: 'CI 없음', ago: (t) => `${t} 전`, for: (t) => `${t}째`, waiting: '대기', none: '없음', not_required: '필수 아님', approved: '승인됨', pr_opened: 'PR 생성', merge: '머지', progress: '처리 과정', agent: '에이전트', files: '변경 파일', no_agent: '연결된 에이전트 없음', no_files: '변경된 파일이 없습니다.', no_log: '실패 로그가 없습니다.', loading: '불러오는 중...',
    a_working: '작업 중', a_idle: '쉬는 중', a_done: '쉬는 중', a_blocked: '입력 기다림', a_unknown: '알 수 없음',
    list_title: 'PR', count: (n) => `${n}개 열림`, synced: (t) => `${t} 전`, empty_title: '아직 PR이 없습니다', empty_body: 'Herdr에서 에이전트가 올린 PR이 여기에 자동으로 나타납니다.',
    k_open: '자세히', k_agent: '에이전트로 이동', k_refresh: '새로고침', k_quit: '닫기', k_back: '뒤로', k_log: 'CI 로그', k_diff: '변경 내용', k_web: 'GitHub', k_scroll: '스크롤', k_file: '파일', no_agent_msg: '이 PR을 작업 중인 에이전트가 없습니다.', log_title: '실패한 CI 로그', diff_title: '변경 내용',
  },
};

export function translator(lang) {
  const table = STRINGS[lang] ?? STRINGS.en;
  return (key, ...args) => {
    const value = table[key] ?? STRINGS.en[key] ?? key;
    return typeof value === 'function' ? value(...args) : value;
  };
}

export function agoText(ms, lang) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const units = lang === 'ko' ? ['초', '분', '시간', '일'] : ['s', 'm', 'h', 'd'];
  if (s < 60) return `${s}${units[0]}`;
  if (s < 3600) return `${Math.floor(s / 60)}${units[1]}`;
  if (s < 86400) return `${Math.floor(s / 3600)}${units[2]}`;
  return `${Math.floor(s / 86400)}${units[3]}`;
}
