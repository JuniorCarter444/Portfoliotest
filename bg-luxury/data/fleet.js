// The BG LUX fleet. Prices are in pounds. `packages` are multi-day prices (3-day, weekly).
// Cars without a dailyRate are "price on request": they show an Enquire button instead of online booking.
// Photos live in public/images/. Swap in the original high-resolution photos with the same file names.
module.exports = [
  { id: 'huracan-evo', name: 'Lamborghini Huracán EVO', trim: 'Spyder', category: 'Supercar', featured: true,
    dailyRate: 998, packages: [{ days: 3, price: 2700, label: '3 days' }], image: 'images/huracan-evo.jpg' },
  { id: 'urus', name: 'Lamborghini Urus', trim: 'V8 Performante', category: 'Supercar', featured: true,
    dailyRate: 950, packages: [{ days: 7, price: 4500, label: 'week' }], shoots: 'Music video shoots from £200/hr', image: 'images/urus.jpg' },
  { id: 'rr-ghost', name: 'Rolls-Royce Ghost', trim: 'Luxury saloon', category: 'Prestige', featured: true,
    dailyRate: null, image: 'images/hero-ghost.jpg' },
  { id: 'range-rover-sport', name: 'Range Rover Sport', trim: 'Dynamic SE', category: 'SUV',
    dailyRate: 250, packages: [{ days: 7, price: 1250, label: 'week' }], image: 'images/range-rover-sport.jpg' },
  { id: 'macan-s', name: 'Porsche Macan S', trim: 'V6', category: 'SUV', dailyRate: 200, image: 'images/macan-s.jpg' },
  { id: 'velar', name: 'Range Rover Velar', trim: 'R-Dynamic', category: 'SUV', dailyRate: 150, image: 'images/velar.jpg' },
  { id: 'x6', name: 'BMW X6', trim: 'xDrive M Sport', category: 'SUV', dailyRate: 150, image: 'images/x6.jpg' },
  { id: 'glb', name: 'Mercedes-Benz GLB', trim: 'AMG Line', category: 'SUV', dailyRate: null, image: 'images/glb.jpg' },
  { id: 'c200', name: 'Mercedes-Benz C 200', trim: 'AMG Line', category: 'Saloon', dailyRate: null, image: 'images/c200.jpg' },
  { id: 'a6', name: 'Audi A6', trim: 'Saloon', category: 'Saloon', dailyRate: null, image: 'images/a6.jpg' },
  { id: 'a180', name: 'Mercedes-Benz A 180', trim: 'AMG', category: 'Saloon', dailyRate: null, image: 'images/a180.jpg' }
];
