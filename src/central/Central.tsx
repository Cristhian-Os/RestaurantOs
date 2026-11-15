/**
 * Central.tsx — entrada de RestaurantOS Central (ruta /central/*). Va en su propio paquete: quien no entra a /central no lo descarga.
 * Orden: puerta de acceso (sesión → rol → 2 pasos → servidor) → datos → cáscara con las pantallas.
 * Si algo de Central falla, RestaurantOS sigue funcionando: Central es una ruta aparte, no parte del panel de los restaurantes.
 */
import './central.css'
import { ModalOscuro } from '../components/ui/Modal'
import { CentralGate } from './CentralGate'
import { CentralDatos } from './datos.tsx'
import { RutaProvider } from './navegacion.tsx'
import { Shell } from './Shell'

export default function Central() {
  return (
    // Central es siempre oscuro (láminas de referencia); usa los tokens --w-* y central.css los vuelve vidrio (solo dentro de .central).
    <div data-theme="dark" className="central min-h-screen text-[color:var(--w-text)]" style={{ fontFamily: 'var(--w-font)' }}>
      <ModalOscuro.Provider value>
        <CentralGate>
          <CentralDatos>
            <RutaProvider>
              <Shell />
            </RutaProvider>
          </CentralDatos>
        </CentralGate>
      </ModalOscuro.Provider>
    </div>
  )
}
