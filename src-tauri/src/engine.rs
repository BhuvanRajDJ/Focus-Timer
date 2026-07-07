use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum SessionType {
    Focus,
    ShortBreak,
    LongBreak,
}

impl SessionType {
    pub fn to_str(&self) -> &'static str {
        match self {
            SessionType::Focus => "focus",
            SessionType::ShortBreak => "shortBreak",
            SessionType::LongBreak => "longBreak",
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum TimerStatus {
    Idle,
    Running,
    Paused,
    Finished,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TimerState {
    pub status: TimerStatus,
    pub sessionType: SessionType,
    pub endTimestamp: Option<u64>,
    pub remainingMs: u64,
    pub totalMs: u64,
    pub completedCount: u32,
    pub endedType: Option<SessionType>,
}

#[derive(Debug, Clone)]
pub struct EngineConfig {
    pub focus_minutes: u32,
    pub short_break_minutes: u32,
    pub long_break_minutes: u32,
    pub sessions_before_long_break: u32,
    pub add_time_minutes: u32,
}

const MIN: u64 = 60_000;

pub struct TimerEngine {
    status: TimerStatus,
    session_type: SessionType,
    end_timestamp: Option<u64>,
    remaining_ms: u64,
    total_ms: u64,
    completed_count: u32,
    ended_type: Option<SessionType>,
    cfg: EngineConfig,
    now_fn: fn() -> u64,
}

impl TimerEngine {
    pub fn new(cfg: EngineConfig, now_fn: Option<fn() -> u64>) -> Self {
        let actual_now = now_fn.unwrap_or(|| chrono::Utc::now().timestamp_millis() as u64);
        let mut engine = TimerEngine {
            status: TimerStatus::Idle,
            session_type: SessionType::Focus,
            end_timestamp: None,
            remaining_ms: 0,
            total_ms: 0,
            completed_count: 0,
            ended_type: None,
            cfg,
            now_fn: actual_now,
        };
        engine.total_ms = engine.duration_ms(SessionType::Focus);
        engine.remaining_ms = engine.total_ms;
        engine
    }

    pub fn update_config(&mut self, cfg: EngineConfig) {
        self.cfg = cfg;
        if self.status == TimerStatus::Idle {
            self.total_ms = self.duration_ms(SessionType::Focus);
            self.remaining_ms = self.total_ms;
        }
    }

    fn duration_ms(&self, t: SessionType) -> u64 {
        match t {
            SessionType::Focus => self.cfg.focus_minutes as u64 * MIN,
            SessionType::ShortBreak => self.cfg.short_break_minutes as u64 * MIN,
            SessionType::LongBreak => self.cfg.long_break_minutes as u64 * MIN,
        }
    }

    pub fn get_state(&self) -> TimerState {
        let mut remaining = self.remaining_ms;
        if self.status == TimerStatus::Running {
            if let Some(end) = self.end_timestamp {
                let now = (self.now_fn)();
                if end > now {
                    remaining = end - now;
                } else {
                    remaining = 0;
                }
            }
        }
        TimerState {
            status: self.status,
            sessionType: self.session_type,
            endTimestamp: self.end_timestamp,
            remainingMs: remaining,
            totalMs: self.total_ms,
            completedCount: self.completed_count,
            endedType: self.ended_type,
        }
    }

    pub fn start(&mut self) {
        if self.status != TimerStatus::Idle {
            return;
        }
        self.begin_session(SessionType::Focus);
    }

    pub fn pause(&mut self) {
        if self.status != TimerStatus::Running {
            return;
        }
        if let Some(end) = self.end_timestamp {
            let now = (self.now_fn)();
            let remaining = if end > now { end - now } else { 0 };
            if remaining == 0 {
                return; // spec: pause disallowed at 0
            }
            self.remaining_ms = remaining;
            self.end_timestamp = None;
            self.status = TimerStatus::Paused;
        }
    }

    pub fn resume(&mut self) {
        if self.status != TimerStatus::Paused {
            return;
        }
        let now = (self.now_fn)();
        self.end_timestamp = Some(now + self.remaining_ms);
        self.status = TimerStatus::Running;
    }

    pub fn restart(&mut self) {
        if self.status == TimerStatus::Idle {
            return;
        }
        self.begin_session(self.session_type);
    }

    pub fn cancel(&mut self) {
        if self.status == TimerStatus::Idle {
            return;
        }
        self.status = TimerStatus::Idle;
        self.session_type = SessionType::Focus;
        self.end_timestamp = None;
        self.ended_type = None;
        self.total_ms = self.duration_ms(SessionType::Focus);
        self.remaining_ms = self.total_ms;
    }

    pub fn add_time(&mut self) {
        let inc = self.cfg.add_time_minutes as u64 * MIN;
        if self.status == TimerStatus::Running {
            if let Some(end) = self.end_timestamp {
                self.end_timestamp = Some(end + inc);
                self.total_ms += inc;
            }
        } else if self.status == TimerStatus::Paused {
            self.remaining_ms += inc;
            self.total_ms += inc;
        }
    }

    pub fn tick(&mut self) -> Option<SessionType> {
        if self.status == TimerStatus::Running {
            if let Some(end) = self.end_timestamp {
                let now = (self.now_fn)();
                if now >= end {
                    self.finish();
                    return Some(self.ended_type.unwrap());
                }
            }
        }
        None
    }

    fn finish(&mut self) {
        let ended = self.session_type;
        self.status = TimerStatus::Finished;
        self.ended_type = Some(ended);
        self.end_timestamp = None;
        self.remaining_ms = 0;
        if ended == SessionType::Focus {
            self.completed_count += 1;
        }
    }

    pub fn dismiss(&mut self) -> Option<SessionType> {
        if self.status != TimerStatus::Finished {
            return None;
        }
        if let Some(ended) = self.ended_type {
            if ended == SessionType::Focus {
                let is_long = self.completed_count > 0
                    && self.completed_count % self.cfg.sessions_before_long_break == 0;
                let next_type = if is_long {
                    SessionType::LongBreak
                } else {
                    SessionType::ShortBreak
                };
                self.begin_session(next_type);
            } else {
                if ended == SessionType::LongBreak {
                    self.completed_count = 0;
                }
                self.begin_session(SessionType::Focus);
            }
            return Some(self.session_type);
        }
        None
    }

    fn begin_session(&mut self, t: SessionType) {
        self.session_type = t;
        self.total_ms = self.duration_ms(t);
        self.remaining_ms = self.total_ms;
        let now = (self.now_fn)();
        self.end_timestamp = Some(now + self.total_ms);
        self.status = TimerStatus::Running;
        self.ended_type = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static CLOCK_T: Mutex<u64> = Mutex::new(1_000_000);

    fn mock_now() -> u64 {
        *CLOCK_T.lock().unwrap()
    }

    fn advance_mock_clock(ms: u64) {
        let mut t = CLOCK_T.lock().unwrap();
        *t += ms;
    }

    fn set_mock_clock(val: u64) {
        let mut t = CLOCK_T.lock().unwrap();
        *t = val;
    }

    fn get_test_cfg() -> EngineConfig {
        EngineConfig {
            focus_minutes: 25,
            short_break_minutes: 5,
            long_break_minutes: 15,
            sessions_before_long_break: 4,
            add_time_minutes: 5,
        }
    }

    #[test]
    fn test_starts_idle_showing_full_focus_duration() {
        set_mock_clock(1_000_000);
        let e = TimerEngine::new(get_test_cfg(), Some(mock_now));
        let s = e.get_state();
        assert_eq!(s.status, TimerStatus::Idle);
        assert_eq!(s.sessionType, SessionType::Focus);
        assert_eq!(s.remainingMs, 25 * MIN);
        assert_eq!(s.completedCount, 0);
    }

    #[test]
    fn test_start_begins_running_focus_session() {
        set_mock_clock(1_000_000);
        let mut e = TimerEngine::new(get_test_cfg(), Some(mock_now));
        e.start();
        let s = e.get_state();
        assert_eq!(s.status, TimerStatus::Running);
        assert_eq!(s.sessionType, SessionType::Focus);
        assert_eq!(s.endTimestamp, Some(1_000_000 + 25 * MIN));
    }

    #[test]
    fn test_derives_remaining_from_clock_drift_free() {
        set_mock_clock(1_000_000);
        let mut e = TimerEngine::new(get_test_cfg(), Some(mock_now));
        e.start();
        advance_mock_clock(10 * MIN);
        assert_eq!(e.get_state().remainingMs, 15 * MIN);
    }

    #[test]
    fn test_pause_freezes_remaining_resume_recomputes_fresh() {
        set_mock_clock(1_000_000);
        let mut e = TimerEngine::new(get_test_cfg(), Some(mock_now));
        e.start();
        advance_mock_clock(10 * MIN);
        e.pause();
        assert_eq!(e.get_state().status, TimerStatus::Paused);
        assert_eq!(e.get_state().remainingMs, 15 * MIN);

        advance_mock_clock(60 * MIN);
        assert_eq!(e.get_state().remainingMs, 15 * MIN);

        e.resume();
        assert_eq!(e.get_state().status, TimerStatus::Running);
        assert_eq!(e.get_state().remainingMs, 15 * MIN);
        assert_eq!(e.get_state().endTimestamp, Some(mock_now() + 15 * MIN));
    }

    #[test]
    fn test_pause_disallowed_at_zero() {
        set_mock_clock(1_000_000);
        let mut e = TimerEngine::new(get_test_cfg(), Some(mock_now));
        e.start();
        advance_mock_clock(25 * MIN);
        e.pause();
        assert_eq!(e.get_state().status, TimerStatus::Running);
    }

    #[test]
    fn test_restart_resets_current_session() {
        set_mock_clock(1_000_000);
        let mut e = TimerEngine::new(get_test_cfg(), Some(mock_now));
        e.start();
        advance_mock_clock(20 * MIN);
        e.restart();
        let s = e.get_state();
        assert_eq!(s.sessionType, SessionType::Focus);
        assert_eq!(s.remainingMs, 25 * MIN);
        assert_eq!(s.endTimestamp, Some(mock_now() + 25 * MIN));
    }

    #[test]
    fn test_cancel_returns_to_idle() {
        set_mock_clock(1_000_000);
        let mut e = TimerEngine::new(get_test_cfg(), Some(mock_now));
        e.start();
        advance_mock_clock(5 * MIN);
        e.cancel();
        let s = e.get_state();
        assert_eq!(s.status, TimerStatus::Idle);
        assert_eq!(s.completedCount, 0);
        assert!(s.endedType.is_none());
    }

    #[test]
    fn test_add_time_extends_running_session() {
        set_mock_clock(1_000_000);
        let mut e = TimerEngine::new(get_test_cfg(), Some(mock_now));
        e.start();
        advance_mock_clock(5 * MIN);
        e.add_time();
        assert_eq!(e.get_state().remainingMs, 25 * MIN);
    }

    #[test]
    fn test_add_time_extends_paused_session() {
        set_mock_clock(1_000_000);
        let mut e = TimerEngine::new(get_test_cfg(), Some(mock_now));
        e.start();
        advance_mock_clock(5 * MIN);
        e.pause();
        e.add_time();
        assert_eq!(e.get_state().remainingMs, 25 * MIN);
    }

    #[test]
    fn test_finishes_exactly_at_zero() {
        set_mock_clock(1_000_000);
        let mut e = TimerEngine::new(get_test_cfg(), Some(mock_now));
        e.start();
        advance_mock_clock(25 * MIN);
        let ended = e.tick();
        assert_eq!(ended, Some(SessionType::Focus));
        let s = e.get_state();
        assert_eq!(s.status, TimerStatus::Finished);
        assert_eq!(s.endedType, Some(SessionType::Focus));
        assert_eq!(s.completedCount, 1);
    }

    #[test]
    fn test_sleep_wake_finishes_on_tick() {
        set_mock_clock(1_000_000);
        let mut e = TimerEngine::new(get_test_cfg(), Some(mock_now));
        e.start();
        advance_mock_clock(5 * 60 * MIN);
        let ended = e.tick();
        assert_eq!(ended, Some(SessionType::Focus));
        let s = e.get_state();
        assert_eq!(s.status, TimerStatus::Finished);
        assert_eq!(s.remainingMs, 0);
    }

    #[test]
    fn test_no_auto_advance_while_unacknowledged() {
        set_mock_clock(1_000_000);
        let mut e = TimerEngine::new(get_test_cfg(), Some(mock_now));
        e.start();
        advance_mock_clock(25 * MIN);
        e.tick();
        advance_mock_clock(10 * MIN);
        e.tick();
        assert_eq!(e.get_state().status, TimerStatus::Finished);
    }

    #[test]
    fn test_dismiss_after_focus_starts_short_break() {
        set_mock_clock(1_000_000);
        let mut e = TimerEngine::new(get_test_cfg(), Some(mock_now));
        e.start();
        advance_mock_clock(25 * MIN);
        e.tick();
        let next_type = e.dismiss();
        assert_eq!(next_type, Some(SessionType::ShortBreak));
        let s = e.get_state();
        assert_eq!(s.status, TimerStatus::Running);
        assert_eq!(s.sessionType, SessionType::ShortBreak);
        assert_eq!(s.remainingMs, 5 * MIN);
    }
}
