// 실제 사이트 안내문 원문 → 기대 규격.
// 원문은 한 글자도 고치지 않는다 (지어낸 케이스 금지 — CLAUDE.md). HTML 엔티티만 브라우저처럼 풀었다 (&middot; → ·).
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSpec } = require('./spec.js');

const KB = 1000;
const MB = 1000 * 1000; // 1000 단위: 사이트가 1024 단위여도 항상 한도 안에 들어간다
const PNG_JPEG = ['jpeg', 'png']; // formats는 정규화 후 알파벳순
const R35x45 = [[3.5, 4.5]];

// Play Console > 기본 스토어 등록정보 > 그래픽 (2026-10-22 수집, 업로드 섹션 본문)
const play = [
  {
    name: 'Play 앱 아이콘',
    text: '앱 아이콘은 PNG 또는 JPEG, 최대 1MB, 512 x 512px이어야 하며 디자인 사양 및 메타데이터 정책을 준수해야 합니다.',
    want: { sizes: [[512, 512]], maxBytes: 1 * MB, formats: PNG_JPEG },
  },
  {
    name: 'Play 그래픽 이미지 — 천 단위 쉼표, 대문자 X',
    text: '그래픽 이미지는 PNG 또는 JPEG, 최대 15MB, 1,024px X 500px이어야 합니다. 앱을 추천하도록 선택하면 이 이미지가 사용됩니다. 자세히 알아보기',
    want: { sizes: [[1024, 500]], maxBytes: 15 * MB, formats: PNG_JPEG },
  },
  {
    name: 'Play 휴대전화 스크린샷 — "A X B 사이"는 크기가 아니라 변 범위',
    text: '휴대전화 스크린샷을 2~8장 업로드하세요. 스크린샷은 PNG 또는 JPEG, 장당 최대 8MB, 가로세로 비율 16:9 또는 9:16, 가로세로 길이는 320px X 3840px 사이여야 합니다.',
    want: { minSide: 320, maxSide: 3840, ratios: [[16, 9], [9, 16]], maxBytes: 8 * MB, formats: PNG_JPEG },
  },
  {
    name: 'Play 7인치 태블릿 스크린샷',
    text: '7인치 태블릿 스크린샷을 최대 8장 업로드하세요. 스크린샷은 PNG 또는 JPEG, 장당 최대 8MB, 가로세로 비율 16:9 또는 9:16, 가로세로 길이는 320px X 3840px 사이여야 합니다.',
    want: { minSide: 320, maxSide: 3840, ratios: [[16, 9], [9, 16]], maxBytes: 8 * MB, formats: PNG_JPEG },
  },
  {
    name: 'Play 10인치 태블릿 — "사이"가 없어도 비율(16:9)과 모순되는 A X B는 변 범위',
    text: '10인치 태블릿 스크린샷을 최대 8장 업로드하세요. 스크린샷은 PNG 또는 JPEG, 장당 최대 8MB, 가로세로 비율 16:9 또는 9:16, 가로세로 길이는 1,080px X 7,680px이어야 합니다.',
    want: { minSide: 1080, maxSide: 7680, ratios: [[16, 9], [9, 16]], maxBytes: 8 * MB, formats: PNG_JPEG },
  },
  {
    name: 'Play 데스크톱 스크린샷',
    text: '스크린샷을 4~8장 업로드하세요. 스크린샷은 PNG 또는 JPEG, 장당 최대 8MB, 가로세로 비율 16:9 또는 9:16, 가로세로 길이는 1,080px X 7,680px이어야 합니다.',
    want: { minSide: 1080, maxSide: 7680, ratios: [[16, 9], [9, 16]], maxBytes: 8 * MB, formats: PNG_JPEG },
  },
  {
    name: 'Play Android XR 스크린샷 — 쉼표 없는 7680',
    text: '스크린샷을 4~8장 업로드하세요. 스크린샷은 PNG 또는 JPEG, 장당 최대 8MB, 가로세로 비율 16:9 또는 9:16, 가로세로 길이는 720px X 7680px이어야 합니다.',
    want: { minSide: 720, maxSide: 7680, ratios: [[16, 9], [9, 16]], maxBytes: 8 * MB, formats: PNG_JPEG },
  },
  {
    name: 'Play 동영상 안내 — 규격 없음',
    text: 'YouTube URL을 입력하여 동영상을 추가합니다. 이 동영상은 공개 또는 일부 공개여야 하며 광고는 사용 중지되어 있고 연령 제한이 없어야 합니다.',
    want: null,
  },
  {
    name: 'Play 애셋 패널의 메타데이터 — 요구 표현이 없으니 규격이 아니다 (∶는 U+2236)',
    text: '선택 취소됨 애셋 07.png\n07.png\n9∶16 \n가로세로 비율: 9∶16\n1080x1920px \n크기: 1080x1920px\n2026년 10월 19일\n업로드 날짜: 2026년 10월 19일',
    want: null,
  },
  {
    name: 'Play 페이지 전체 — 슬롯마다 규격이 달라 모호하니 null',
    text: [
      '앱 아이콘은 PNG 또는 JPEG, 최대 1MB, 512 x 512px이어야 하며 디자인 사양 및 메타데이터 정책을 준수해야 합니다.',
      '그래픽 이미지는 PNG 또는 JPEG, 최대 15MB, 1,024px X 500px이어야 합니다. 앱을 추천하도록 선택하면 이 이미지가 사용됩니다. 자세히 알아보기',
      '휴대전화 스크린샷을 2~8장 업로드하세요. 스크린샷은 PNG 또는 JPEG, 장당 최대 8MB, 가로세로 비율 16:9 또는 9:16, 가로세로 길이는 320px X 3840px 사이여야 합니다.',
    ].join('\n'),
    want: null,
  },
];

// 공개 안내 페이지 (2026-10-22 수집, curl 원본에서 추출). 업로드 화면 자체는 로그인이 필요해 같은 사이트의 공개 안내문을 쓴다.
const korea = [
  {
    name: 'Q-Net 사진등록 길라잡이 — 단위 없는 (2.5X3.5)·(3X4)는 cm, 200KB 이하',
    src: 'https://www.q-net.or.kr/qnet/html/guideQnet/guide_02.html',
    text: `1. 증명사진(2.5X3.5) 또는 반명함판(3X4) 사진을 준비하시기 바랍니다.
1. 스캔 작업한 파일에 여백이 있는 경우 그림판 프로그램 등을 사용하여 사진파일의 여백을 제거하시기 바랍니다.
※ 등록 가능한 사진파일
· 파일형식 : *.JPG 또는 *.JPEG
· 파일용량 : 200KB 이하
※ 사진등록 시 참고사항
- 얼굴형태(이마, 눈썹,눈,코, 입)가 잘 보여야 업로드가 가능합니다.`,
    want: { ratios: [[2.5, 3.5], [3, 4]], maxBytes: 200 * KB, formats: ['jpeg'] },
  },
  {
    name: 'Q-Net FAQ — "300 X 400 픽셀 이상"은 최소 크기',
    src: 'https://q-net.or.kr/cst002.do?id=cst00202&gSite=Q&gId=&artlSeq=1000033',
    text: `• 사진은 증명, 반명함 또는 여권용 사진을 스캔하여 등록합니다.
  (단, 일부 스캔본은 A4 크기의 화면에 사진이 스캔되었을 경우도 있으니 편집이 필요할 수 있습니다.)
• 사진 파일 규격
- 크기 → 300 X 400 픽셀 이상
- 형식 → jpeg 또는 jpg 파일`,
    want: { minSize: [300, 400], formats: ['jpeg'] },
  },
  {
    name: 'Q-Net 다른 FAQ — 같은 사이트인데 "가로 300px 세로400px 이내"는 최대 크기',
    src: 'https://q-net.or.kr/cst002.do?id=cst00202 (artlSeq=5036175)',
    text: '- 증명사진 파일(jpg형식을 확인 후, 상체가 너무 많이 나오지않았는지, 가로 300px 세로400px 이내인지 확인)',
    want: { maxSize: [300, 400], formats: ['jpeg'] },
  },
  {
    name: 'Q-Net 공인중개사 — cm 비율 + "150 * 200 이상" + 200KB 이하가 한 줄에',
    src: 'https://q-net.or.kr/cst002.do?id=cst00202&gSite=L&gId=08&artlSeq=1000800',
    text: '- 원서접수 시 최근 6개월 이내에 촬영한 여권용 사진(3.5cm*4.5cm)을 파일(JPG, JPEG 파일, 사이즈 150 * 200 이상, 300DPI 권장, 200KB 이하)로 등록',
    want: { ratios: R35x45, minSize: [150, 200], maxBytes: 200 * KB, formats: ['jpeg'] },
  },
  {
    name: '사이버국가고시센터 — cm와 px가 함께, 350KB 미만',
    src: 'https://gongmuwon.gosi.kr/oprut/AppApAplfSbmsnAplfRcptGd.do',
    text: `응시원서 등록용 사진파일(JPG, PNG) 규격
크기 3.5cm x 4.5cm(137 x 177 pixel) 기준
파일용량 350KB 미만(중증장애인 선발시험 제외)`,
    want: { sizes: [[137, 177]], ratios: R35x45, maxBytes: 350 * KB - 1, formats: PNG_JPEG },
  },
  {
    name: '지방자치단체 원서접수 — 100DPI는 무시, cm는 비율',
    src: 'https://local.gosi.go.kr/klid/regs/photoExample.do',
    text: `사진의 경우에는 규격보다 작은 사이즈의 사진이거나 DPI가 100DPI 미만인 사진을 등록한 경우로서 이때는 규격에 맞는 사진을 등록해 주시기 바랍니다.
원서작성 시 사진의 규격은 해상도100DPI 이상의 3.5cm x 4.5cm 사진입니다.
원서접수 기간이 마감되면 사진 및 접수정보의 수정이 불가능하오니, 사진등록 후 [마이페이지]에서 사진이 정상적으로 등록되어 있는지 확인하시기 바랍니다.`,
    want: { ratios: R35x45 },
  },
  {
    name: '사람인 — "용량 : 10MB", ".jpg .gif", 권장 크기',
    src: 'https://www.saramin.co.kr/zf_user/help/help-word/view?idx=524',
    text: `사진 픽셀이 클 경우 자동으로 회전되어 등록됩니다.
기본 사진 등록 기준을 먼저 확인해 주시기 바랍니다.
1. 용량 : 10MB
2. 파일형태 : .jpg .gif
3. 권장 크기 : 100 x 140 픽셀`,
    want: { sizes: [[100, 140]], maxBytes: 10 * MB, formats: ['gif', 'jpeg'] },
  },
  {
    name: '여권 온라인 — 권장 크기 + 가로·세로 각각의 범위',
    src: 'https://www.passport.go.kr/home/kor/contents.do?menuPos=12',
    text: `제출 가능한 사진파일 안내
여권 사진 규정에 적합한 사진 ( 여권사진 규격 안내 참고)
파일 크기 500KB 이하, 파일 형식 JPG/JPEG
가로 413 픽셀(pixel), 세로 531 픽셀 사이즈 권장(가로 395~431 픽셀, 세로 507~550 픽셀 이내만 업로드 가능)
해상도는 300dpi 권장
6개월 이내에 촬영된 사진
제출 불가한 사진파일 안내
배경이 흰색이 아니거나, 배경색을 사진 편집 프로그램으로 제거하여 사진이 변형된 경우
사진 내 머리길이가 정수리(머리카락을 제외한 머리 최상부)부터 턱까지 길이가 지나치게 짧거나 긴 경우, 시스템 사전 품질검사를 통과했더라도 여권 발급 심사시 반려될 수 있음 (머리길이는 사진파일을 가로 3.5cm, 세로 4.5cm로 인화했다는 가정하에 3.2~3.6cm가 될 수 있도록 촬영해야 함) `,
    want: { sizes: [[413, 531]], minSize: [395, 507], maxSize: [431, 550], ratios: R35x45, maxBytes: 500 * KB, formats: ['jpeg'] },
  },
  {
    name: '도로교통공단 운전면허 — "가로 3.5cm, 세로 4.5cm(가로 350픽셀, 세로 450픽셀)", 뒤의 "6개월 이내"에 속지 않기',
    src: 'https://www.koroad.or.kr/main/board/1/787/board_view.do',
    text: `'16. 02. 01(월) 부터 인터넷을 통한 접수 시 운전면허 민원용 사진은 여권용 규격을 적용하오니
고객님들께서는 온라인 신청을 통한 사진 등록 시 참고하시기 바랍니다.
- 가로 3.5cm, 세로 4.5cm(가로 350픽셀, 세로 450픽셀)인 6개월 이내 촬영한 상반신 정면 탈모사진이어야 합니다.
※ 온라인 신청 시, 기존 증명사진과 여권용 사진 둘다 수용 가능하오나
부적합 사진(포토샵 수정, 풍경사진 등) 등록 시 운전면허증 발급이 거부당할 수 있음을 알려드립니다.`,
    want: { sizes: [[350, 450]], ratios: R35x45 },
  },
  {
    name: '도로교통공단 2026 — "3.5 X 4.5cm" 뒤의 머리 길이 "3.2~3.6cm 사이"는 무관',
    src: 'https://www.koroad.or.kr/main/board/9/306204/board_view.do',
    text: `2026년 3월 1일부터 운전면허증에 여권용 사진 규격을 엄격히 적용합니다.
- 3.5cm * 4.5cm 탈모, 상반신, 흰색 배경, 6개월 이내 촬영한 컬러 사진(사진인화용지)
5) (사진 및 얼굴 크기) 사진 3.5 X 4.5cm, 머리 길이는 3.2~3.6cm 사이인 것으로 해야 함. `,
    want: { ratios: R35x45 },
  },
  {
    name: '정부24 주민등록증 — ㎝(U+339D)와 ×',
    src: 'https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=13100000018',
    text: '6개월 이내에 촬영한 3.5㎝×4.5㎝의 모자 등을 쓰지 않은 상반신 사진 1장',
    want: { ratios: R35x45 },
  },
  {
    name: '진학어플라이 — 반명함판(3X4)이 두 번 나와도 하나',
    src: 'https://apply.jinhakapply.com/Customer/Faq?categoryid=7',
    text: `사진 규정
3개월 이내 촬영한 반명함판(3X4) 사진을 업로드해 주세요.
▶ 별도의 사진 규정이 있는 학교도 있습니다. 학교 모집요강을 확인해 주세요.
▶ 원서에 사진항목이 없으면 학교에서 받지 않는 것입니다.
사진 업로드 방법
증명사진(3x4)을 스캔 파일(jpg, jpeg)을 준비해 주세요.
사진입력 항목 → [사진 편집 업로드] → [사진 불러오기] → [자동크기조절] → [사진 등록하기] 의 순서로 진행해 주세요. `,
    want: { ratios: [[3, 4]], formats: ['jpeg'] },
  },
  {
    name: '사이버경찰청 — "3cm X 4cm"',
    src: 'https://public.jinhakapply.com/PoliceV2/useinfo/useinfo02_2.aspx',
    text: '최근 1년 이내에 촬영한 상반신 컬러사진(3cm X 4cm)을 업로드 해주세요.',
    want: { ratios: [[3, 4]] },
  },
  {
    name: '유웨이 FAQ — 절차 안내뿐, 규격 없음',
    src: 'https://wwwsub.uwayapply.com/board/faq.htm?CTG_CD=FAQKOR',
    text: `1) 사진 업로드에 필요한 증명사진을 스캔 후 파일로 저장하시기 바랍니다.
(각 대학의 사진 업로드 유의사항에 준하는 형태로 스캔)`,
    want: null,
  },
  {
    name: '성신여대 모집요강(PDF) — "3㎝ × 4㎝", jpg',
    src: 'https://ipsi2.uwayapply.com/jung2/sungshin/etc_file/etc_fileN1.pdf',
    text: '1) 최근 3개월 이내에 촬영한 반명함판 사진(컬러, 3㎝ × 4㎝)을 스캔하여 jpg 파일로 첨부하여야 합니다.',
    want: { ratios: [[3, 4]], formats: ['jpeg'] },
  },
  {
    name: '한국사능력검정 — "가로(120px), 세로(160px)"',
    src: 'https://m.historyexam.go.kr/pageLink.do?link=rceptInfo',
    text: `사진 파일은 규격에 맞게 첨부하여 주시기 바랍니다.
※ 6개월 이내에 찰영된 탈모 상반신 사진을 올려주세요.
※ 사진 파일은 JPG 또는 GIF 형식만 가능합니다.
※ 가로(120px), 세로(160px) 사이즈로 등록해 주세요.`,
    want: { sizes: [[120, 160]], formats: ['gif', 'jpeg'] },
  },
  {
    name: '출입국 외국인등록 — "가로 3.5cm * 세로 4.5cm", 얼굴길이 범위는 무관',
    src: 'https://www.moj.go.kr/sites/immigration/file/photo-size.html',
    text: `사진크기(Photo size) : 가로 3.5cm * 세로 4.5cm
6개월 이내에 촬영한 흰색 바당에 천연색 정면 얼굴 사진
얼굴길이(머리 정수리부터 턱까지) : 2.5cm ~ 3.5cm(세로)`,
    want: { ratios: R35x45 },
  },
  {
    name: 'TOEIC FAQ — 파일 이름 규칙의 ".jpg"는 형식 목록이 아니다',
    src: 'https://exam.toeic.co.kr/customer/csFaq.php?currentPage=3',
    text: `이전 회차 또는 접수기간이 지난 시험의 사진을 변경하시려면 image@ybm.co.kr 로 아래와 같이 이메일을 보내 주시기 바랍니다.

메일제목: 사진변경 신청(이름)
첨부할 파일: 신분증 앞면 스캔파일, 변경할 사진 파일(JPG 또는 JPEG)
(단, 신분증의 주민등록번호 뒷자리 마스킹 또는 삭제 후, 제출)
변경할 사진 파일 이름: 생년월일+이름.jpg (ex. 900405홍길동)`,
    want: { formats: ['jpeg'] },
  },
  {
    name: 'Apple App Store Connect 도움말 — 형식만 (크기는 표라서 6단계 프리셋으로)',
    src: 'https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications',
    text: 'You must include at least one screenshot and can upload up to 10 screenshots per device size in .jpeg, .jpg, or .png formats, with the following specifications. All screenshots must adhere to the App Store Review Guidelines before you submit them for review.',
    want: { formats: PNG_JPEG },
  },
];

// 합성 문구 — 안내문이 아닌 텍스트에서 오탐하지 않는지 (CLAUDE.md: 음성 케이스만 합성 허용, 여기에 따로 둔다)
const notSpecs = [
  { name: '오탐 방지: "3,000 x 2개" — 단위 없이 한쪽만 작으면 크기가 아니다', text: '배송비 3,000 x 2개 결제 가능합니다', want: null },
  { name: '오탐 방지: "0x1F" — 0이 든 값은 크기도 비율도 아니다', text: 'Register 0x1F should be cleared', want: null },
];

for (const c of [...play, ...korea, ...notSpecs]) {
  test(c.name, () => assert.deepEqual(parseSpec(c.text), c.want));
}
