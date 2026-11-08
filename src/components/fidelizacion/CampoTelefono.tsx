/**
 * CampoTelefono.tsx — país + número. Entrega solo dígitos con indicativo (ej. 573001234567), vacío si no hay.
 * `inicial` es un número ya guardado (solo dígitos); se separa en país y número para poder editarlo.
 */
import { useState } from 'react'
import { Input, Select } from '../ui/Field'
import { PAISES, telefonoConPais } from '../../services/fidelizacionService'

function separar(guardado: string | null | undefined): { pais: string; local: string } {
  if (!guardado) return { pais: '57', local: '' }
  const p = PAISES.filter(x => guardado.startsWith(x.cc)).sort((a, b) => b.cc.length - a.cc.length)[0]
  return p ? { pais: p.cc, local: guardado.slice(p.cc.length) } : { pais: 'otro', local: `+${guardado}` }
}

export function CampoTelefono({ label, inicial, onChange }: { label: string; inicial?: string | null; onChange: (digitos: string) => void }) {
  const [v, setV] = useState(() => separar(inicial))
  const cambiar = (n: { pais: string; local: string }) => {
    setV(n)
    onChange(telefonoConPais(n.pais, n.local).replace(/\D/g, ''))
  }
  return (
    <div className="grid grid-cols-[minmax(0,10rem)_1fr] items-start gap-2">
      <Select label="País" value={v.pais} onChange={e => cambiar({ ...v, pais: e.target.value })}>
        {PAISES.map(p => <option key={p.cc} value={p.cc}>{p.nombre} (+{p.cc})</option>)}
        <option value="otro">Otro país</option>
      </Select>
      <Input
        label={label} type="tel" inputMode={v.pais === 'otro' ? 'tel' : 'numeric'}
        hint={v.pais === 'otro' ? 'Escríbelo completo con + y el país.' : 'Sin el indicativo del país.'}
        value={v.local} onChange={e => cambiar({ ...v, local: e.target.value })}
      />
    </div>
  )
}
