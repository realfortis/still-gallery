const examples = [
  ['Salt Memory', 'Rowan Mercer', 'Oil on canvas', '2025', '122 × 76 cm',
    'Scraped layers of oil follow the line where an Atlantic swell breaks against the rocks.',
    'White surf crashes over dark slate under a blue-grey sky in a thickly painted seascape.',
    'salt-memory.jpg', 1],
  ['Between Headlands', 'Iona Bell', 'Acrylic on canvas', '2024', '61 × 61 cm',
    'Low bands of colour hold the last light on a distant ridge.',
    'Layered rust, ochre and charcoal shapes suggest a coastal headland at dusk.',
    'between-headlands.jpg', 0],
  ['Vessel for Rain', 'Mara Vale', 'Stoneware', '2025', '28 × 24 × 23 cm',
    'A hand-built vessel with two openings and a dark, pitted surface.',
    'Dark hand-built stoneware with two flared openings on a muted grey-green backdrop.',
    'vessel-for-rain.jpg', 0]
];
export const exampleWorks = examples.map(([title, artist, medium, year, dimensions, description, alt_text, file, featured], index) => ({
  id: index + 1, title, artist, medium, year, dimensions, description, alt_text, file, featured
}));
