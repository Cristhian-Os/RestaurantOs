/**
 * ciudades.ts — lista fija de ciudades con coordenadas REALES, para que el dueño ubique cada restaurante en el globo.
 * Los restaurantes no guardan coordenadas: el dueño elige la ciudad y se guarda en central_ubicaciones. Nada se inventa ni se adivina.
 */
export interface Ciudad { nombre: string; pais: string; lat: number; lng: number }

export const CIUDADES: Ciudad[] = [
  { nombre: 'Armenia', pais: 'Colombia', lat: 4.5339, lng: -75.6811 },
  { nombre: 'Bogotá', pais: 'Colombia', lat: 4.7110, lng: -74.0721 },
  { nombre: 'Medellín', pais: 'Colombia', lat: 6.2442, lng: -75.5812 },
  { nombre: 'Cali', pais: 'Colombia', lat: 3.4516, lng: -76.5320 },
  { nombre: 'Barranquilla', pais: 'Colombia', lat: 10.9685, lng: -74.7813 },
  { nombre: 'Cartagena', pais: 'Colombia', lat: 10.3910, lng: -75.4794 },
  { nombre: 'Bucaramanga', pais: 'Colombia', lat: 7.1193, lng: -73.1227 },
  { nombre: 'Pereira', pais: 'Colombia', lat: 4.8133, lng: -75.6961 },
  { nombre: 'Manizales', pais: 'Colombia', lat: 5.0703, lng: -75.5138 },
  { nombre: 'Santa Marta', pais: 'Colombia', lat: 11.2408, lng: -74.1990 },
  { nombre: 'Cúcuta', pais: 'Colombia', lat: 7.8939, lng: -72.5078 },
  { nombre: 'Ibagué', pais: 'Colombia', lat: 4.4389, lng: -75.2322 },
  { nombre: 'Villavicencio', pais: 'Colombia', lat: 4.1420, lng: -73.6266 },
  { nombre: 'Pasto', pais: 'Colombia', lat: 1.2136, lng: -77.2811 },
  { nombre: 'Neiva', pais: 'Colombia', lat: 2.9273, lng: -75.2819 },
  { nombre: 'Montería', pais: 'Colombia', lat: 8.7480, lng: -75.8814 },
  { nombre: 'Popayán', pais: 'Colombia', lat: 2.4448, lng: -76.6147 },
  { nombre: 'Ciudad de México', pais: 'México', lat: 19.4326, lng: -99.1332 },
  { nombre: 'Lima', pais: 'Perú', lat: -12.0464, lng: -77.0428 },
  { nombre: 'Quito', pais: 'Ecuador', lat: -0.1807, lng: -78.4678 },
  { nombre: 'Ciudad de Panamá', pais: 'Panamá', lat: 8.9824, lng: -79.5199 },
  { nombre: 'Miami', pais: 'Estados Unidos', lat: 25.7617, lng: -80.1918 },
  { nombre: 'Madrid', pais: 'España', lat: 40.4168, lng: -3.7038 },
  { nombre: 'Buenos Aires', pais: 'Argentina', lat: -34.6037, lng: -58.3816 },
  { nombre: 'Santiago', pais: 'Chile', lat: -33.4489, lng: -70.6693 },
  { nombre: 'São Paulo', pais: 'Brasil', lat: -23.5505, lng: -46.6333 },
]
