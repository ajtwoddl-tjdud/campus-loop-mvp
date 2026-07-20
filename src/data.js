export const campuses = {
  NTU: {
    pickup: 'NTU Main Gate Welcome Point',
    dates: ['Aug 31', 'Sep 1', 'Sep 2'],
  },
  NCCU: {
    pickup: 'NCCU Main Gate Welcome Point',
    dates: ['Sep 2', 'Sep 3', 'Sep 4'],
  },
}

export const baseItems = [
  'Folding drying rack',
  '10 hangers',
  '2 storage baskets',
  'Table mirror',
  'Dining set',
  'Cleaning set',
]

export const addons = [
  { id: 'bedding', name: 'New bedding set', price: 1250, icon: 'BedDouble' },
  { id: 'towels', name: 'New towel set', price: 420, icon: 'Layers3' },
  { id: 'humidity', name: 'Humidity starter', price: 280, icon: 'Droplets' },
]

export const money = (value) => `NTD ${value.toLocaleString('en-US')}`
