export const campuses = {
  NTU: {
    pickup: 'NTU Main Gate Welcome Point',
    returnPoint: 'NTU Main Gate Return Point',
    dates: ['2026-08-31', '2026-09-01', '2026-09-02'],
    rule: {
      en: 'Confirm dorm-provided items before adding duplicates. Electrical appliances are not included.',
      ko: '기숙사 제공품을 먼저 확인해 주세요. 전기제품은 렌탈 품목에 포함되지 않습니다.',
      zh: '請先確認宿舍提供的物品。租借品不包含電器。',
    },
  },
  NCCU: {
    pickup: 'NCCU Main Gate Welcome Point',
    returnPoint: 'NCCU Main Gate Return Point',
    dates: ['2026-09-02', '2026-09-03', '2026-09-04'],
    rule: {
      en: 'Dorm rules differ by building. Cooking appliances and other electrical items are not included.',
      ko: '건물별 기숙사 규정이 다릅니다. 조리가전 등 전기제품은 포함되지 않습니다.',
      zh: '各棟宿舍規定不同。不提供烹飪電器或其他電器用品。',
    },
  },
}

export const stayOptions = [
  {
    id: 'short',
    name: { en: '1–3 months', ko: '1~3개월', zh: '1–3 個月' },
    description: { en: 'Best for language programs and short stays', ko: '어학연수·단기 체류에 적합', zh: '適合語言課程與短期停留' },
    recommendation: 'lite',
  },
  {
    id: 'semester',
    name: { en: 'One semester', ko: '한 학기', zh: '一學期' },
    description: { en: 'A balanced setup for exchange students', ko: '교환학생을 위한 균형 잡힌 구성', zh: '適合交換學生的均衡組合' },
    recommendation: 'core',
  },
  {
    id: 'long',
    name: { en: '1 year or more', ko: '1년 이상', zh: '一年以上' },
    description: { en: 'Choose only the items you will keep using', ko: '오래 사용할 품목만 직접 선택', zh: '只選擇會長期使用的品項' },
    recommendation: 'custom',
  },
]

export const rentalProducts = [
  { id: 'rack', name: { en: 'Folding drying rack', ko: '접이식 빨래건조대', zh: '折疊曬衣架' }, price: 260, icon: 'Wind' },
  { id: 'hangers', name: { en: '10 hangers', ko: '옷걸이 10개', zh: '衣架 10 個' }, price: 100, icon: 'Shirt' },
  { id: 'baskets', name: { en: '2 storage baskets', ko: '수납 바구니 2개', zh: '收納籃 2 個' }, price: 230, icon: 'PackageOpen' },
  { id: 'mirror', name: { en: 'Table mirror', ko: '탁상거울', zh: '桌上鏡' }, price: 150, icon: 'PanelTop' },
  { id: 'dining', name: { en: 'Dining set', ko: '기본 식기 세트', zh: '基本餐具組' }, price: 240, icon: 'Utensils' },
  { id: 'cleaning', name: { en: 'Cleaning set', ko: '청소도구 세트', zh: '清潔用品組' }, price: 210, icon: 'SprayCan' },
]

export const purchaseProducts = [
  { id: 'bedding', name: { en: 'New bedding set', ko: '새 침구 세트', zh: '全新寢具組' }, description: { en: 'Fresh and yours to keep', ko: '새 제품 · 반납 불필요', zh: '全新品 · 無需歸還' }, price: 1250, icon: 'BedDouble' },
  { id: 'towels', name: { en: 'New towel set', ko: '새 수건 세트', zh: '全新毛巾組' }, description: { en: 'Three everyday towels', ko: '일상용 수건 3장', zh: '日用毛巾 3 條' }, price: 420, icon: 'Layers3' },
  { id: 'humidity', name: { en: 'Humidity starter', ko: '제습 스타터', zh: '除濕入門組' }, description: { en: 'Disposable moisture care', ko: '소모성 습기 관리용품', zh: '一次性防潮用品' }, price: 280, icon: 'Droplets' },
]

export const bundles = {
  lite: ['hangers', 'baskets', 'dining', 'cleaning'],
  core: rentalProducts.map((item) => item.id),
}

export const money = (value) => `NTD ${value.toLocaleString('en-US')}`

export const localized = (value, language) => value[language] ?? value.en
