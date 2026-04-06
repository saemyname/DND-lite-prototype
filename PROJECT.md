# DND-lite · 프로젝트 계획서

> 마지막 업데이트: 2026-04-06

---

## 프로젝트 개요

던전앤드래곤(D&D)을 온라인으로 즐길 수 있는 **Lite 버전 웹 게임** 프로토타입.
복잡한 원작 룰을 대폭 단순화하고, 온라인이라는 장점을 살려
**몰입감 있는 시각 경험(immersive experience)**에 집중한다.

- 플레이어: 실제 사람만 (AI DM 없음)
- 시작: 싱글플레이어 프로토타입
- 핵심 철학: 룰 단순화 + 시각적 몰입감 극대화

---

## 완료된 작업 ✅

### 1. Parallax Layering 데모 (`parallax-demo.html`)
- 6개 레이어 구조 (배경 → 전경, 각기 다른 속도)
- 마우스 움직임 → 레이어 시차 효과 (2.5D 깊이감)
- 던전 분위기: 횃불 flicker 애니메이션, 먼지 파티클, 비녜트
- **이미지 에셋 기반으로 전환 완료** (SVG → PNG 레이어)
- 터치 지원 (모바일 호환)

**현재 이미지 에셋 현황:**
| 레이어 | 파일 | 상태 |
|--------|------|------|
| L0 배경 | `images/layer0-bg.png` | ✅ 완료 |
| L1 아치 | `images/layer1-arch.png` | ✅ 완료 |
| L2 벽+횃불 | `images/layer2-walls.png` | ✅ 완료 |
| L3 천장/바닥 | `images/layer3-ceiling-floor.png` | ⬜ 미완료 |
| L4 기둥 | `images/layer4-pillars.png` | ✅ 완료 |
| L5 전경 | `images/layer5-foreground.png` | ⬜ 미완료 |

---

### 2. Gaussian Splat + Face Tracking 데모 (`splat-face-demo.html`)
- **Gaussian Splatting** 렌더러 구축 (`@mkkellogg/gaussian-splats-3d`)
- **MediaPipe Face Landmarker** 실시간 얼굴 추적
- 코끝(landmark 4) → 카메라 X/Y 오프셋 → head-coupled perspective 효과
- 웹캠 없을 시 마우스 자동 fallback
- 공개 씬 3종 프리셋: Bonsai / Bicycle / Garden (Hugging Face)
- 커스텀 URL 입력 지원

**npm 패키지 설치 완료:**
- `@mkkellogg/gaussian-splats-3d`
- `@mediapipe/tasks-vision`
- `three`

**현재 이슈:**
- `unpkg.com` CORS 차단 → 로컬 `node_modules` 경로로 우회 (해결됨)
- Hugging Face splat 씬 파일이 수십 MB → 로컬 캐시 권장

---

## 진행 중 / 다음 단계 🔜

### Phase 1: Immersive Experience 완성
- [ ] `layer3-ceiling-floor.png` 이미지 생성 및 추가
- [ ] `layer5-foreground.png` 이미지 생성 및 추가
- [ ] Splat 데모에서 face tracking 실제 동작 확인 및 강도 튜닝
- [ ] Parallax + Splat 중 최종 방향 결정

### Phase 2: D&D Lite 룰 시스템
- [ ] 캐릭터 시스템 (스탯 3~4개: 힘, 민첩, 지능, 운)
- [ ] 역할 선택 (전사 / 도적 / 마법사)
- [ ] 전투 시스템 (d20 굴리기, 목표 숫자 넘으면 성공)
- [ ] 인벤토리 (최대 5개 아이템)

### Phase 3: 장소/씬 시스템
- [ ] 장소별 배경 환경 전환 (Parallax 씬 교체)
- [ ] 장소 데이터 구조 정의 (이름, 배경, 이벤트, 출구)
- [ ] 씬 전환 애니메이션 (페이드, 슬라이드)

### Phase 4: 멀티플레이어
- [ ] 기술 스택 선택 (WebSocket vs Firebase Realtime DB)
- [ ] 방 생성 / 입장 UI
- [ ] 플레이어 상태 동기화

---

## 기술 스택

| 분야 | 선택 | 비고 |
|------|------|------|
| 렌더링 | HTML/CSS/JS | 순수 웹, 설치 불필요 |
| Parallax | CSS + Vanilla JS | 6레이어 구조 |
| 3D Splat | `@mkkellogg/gaussian-splats-3d` | Three.js 기반 |
| Face Tracking | `@mediapipe/tasks-vision` | FaceLandmarker, GPU |
| 이미지 에셋 | Gemini 생성 | PNG 투명배경 |
| 로컬 서버 | `python3 -m http.server 8080` | 개발용 |

---

## 디렉토리 구조

```
DND-lite/
├── PROJECT.md                  ← 이 파일
├── parallax-demo.html          ← Parallax 레이어 데모
├── splat-face-demo.html        ← Gaussian Splat + Face Tracking 데모
├── start-server.sh             ← 로컬 서버 실행 스크립트
├── images/
│   ├── layer0-bg.png           ✅
│   ├── layer1-arch.png         ✅
│   ├── layer2-walls.png        ✅
│   ├── layer3-ceiling-floor.png ⬜ (미완료)
│   ├── layer4-pillars.png      ✅
│   └── layer5-foreground.png   ⬜ (미완료)
└── node_modules/
    ├── @mkkellogg/gaussian-splats-3d
    ├── @mediapipe/tasks-vision
    └── three
```

---

## 로컬 서버 실행

```bash
cd DND-lite
python3 -m http.server 8080
# → 브라우저: http://localhost:8080/parallax-demo.html
# → 브라우저: http://localhost:8080/splat-face-demo.html
```

---

## 브레인스토밍 메모

**검토한 immersive 기법:**
1. **Parallax Layering** ← 현재 구현 중, 이미지 에셋 적용
2. **Three.js 360° 파노라마** ← 다음 후보
3. **Gaussian Splatting + Face Tracking** ← 현재 구현 중, 테스트 필요
4. ~~AI DM~~ ← 제외 (실제 플레이어만 사용)

**D&D Lite 단순화 방향:**
- 스탯 3~4개로 축소
- 전투: d20 하나로 단순화
- 클래스 대신 "역할" 2~3개
- 인벤토리 5개 이하 제한
