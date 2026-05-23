import { useBusinessMetrics } from '../hooks/useBusinessMetrics'
import Spin from 'antd/es/spin'
import Alert from 'antd/es/alert'

const S = {
  neoOut: { boxShadow: '8px 8px 16px rgba(163,177,198,0.65),-8px -8px 16px rgba(255,255,255,0.75)' },
  neoOutLg: { boxShadow: '12px 12px 24px rgba(163,177,198,0.7),-12px -12px 24px rgba(255,255,255,0.8)' },
}

export default function BusinessAssistant() {
  const metrics = useBusinessMetrics()

  return (
    <div className="min-h-screen bg-neo-base p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-neo-dark mb-2">🤖 Asistente de Negocio</h1>
          <p className="text-neo-mid">Analytics inteligente en tiempo real para optimizar tu restaurante</p>
        </div>

        {/* Matriz BCG */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-neo-dark mb-4">📊 Matriz BCG (Análisis de Menú)</h2>
          {metrics.bcg.isLoading ? (
            <Spin />
          ) : metrics.bcg.error ? (
            <Alert
              message="Error al cargar matriz BCG"
              description={String(metrics.bcg.error)}
              type="error"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {metrics.bcg.data.map((dish) => (
                <div
                  key={dish.dish_id}
                  className="p-4 bg-neo-surface rounded-3xl"
                  style={S.neoOut}
                >
                  <h3 className="font-bold text-neo-dark mb-2">{dish.dish_name}</h3>
                  <div className="text-sm text-neo-mid mb-3">
                    <div>Precio: ${dish.price}</div>
                    <div>Margen: {dish.profit_margin}%</div>
                    <div>Vendidos: {dish.units_sold} unidades</div>
                  </div>
                  <div className="p-3 bg-neo-base rounded-2xl mb-3" style={S.neoOut}>
                    <p className="text-xs font-bold text-neo-coral mb-1">
                      {dish.bcg_quadrant === 'star' && '⭐ ESTRELLA'}
                      {dish.bcg_quadrant === 'cash_cow' && '🐄 VACA LECHERA'}
                      {dish.bcg_quadrant === 'question_mark' && '❓ INTERROGANTE'}
                      {dish.bcg_quadrant === 'dog' && '🐕 PERRO'}
                    </p>
                    <p className="text-xs text-neo-mid">{dish.recommendation}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Alertas Food Cost */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-neo-dark mb-4">⚠️ Alertas de Food Cost</h2>
          {metrics.foodCost.isLoading ? (
            <Spin />
          ) : metrics.foodCost.data.length === 0 ? (
            <Alert message="✅ Todos los márgenes están óptimos" type="success" />
          ) : (
            <div className="space-y-3">
              {metrics.foodCost.data.map((alert) => (
                <Alert
                  key={alert.dish_id}
                  message={alert.dish_name}
                  description={`Margen actual: ${alert.new_margin}% (crítico < 40%). Precio sugerido: $${alert.suggested_price}`}
                  type={alert.critical ? 'error' : 'warning'}
                />
              ))}
            </div>
          )}
        </section>

        {/* Auditoría Anti-Fraude */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-neo-dark mb-4">🔍 Auditoría Anti-Fraude</h2>
          {metrics.fraud.isLoading ? (
            <Spin />
          ) : metrics.fraud.data.length === 0 ? (
            <Alert message="✅ Sin patrones sospechosos detectados" type="success" />
          ) : (
            <div className="space-y-3">
              {metrics.fraud.data.map((pattern) => (
                <Alert
                  key={pattern.pattern}
                  message={pattern.pattern}
                  description={`${pattern.description} (${pattern.affected_orders} órdenes afectadas)`}
                  type={
                    pattern.severity === 'high'
                      ? 'error'
                      : pattern.severity === 'medium'
                        ? 'warning'
                        : 'info'
                  }
                />
              ))}
            </div>
          )}
        </section>

        {/* Predicción de Demanda */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-neo-dark mb-4">📈 Predicción de Demanda</h2>
          {metrics.demand.isLoading ? (
            <Spin />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {metrics.demand.data.map((pred) => (
                <div
                  key={pred.date}
                  className="p-4 bg-neo-surface rounded-3xl"
                  style={S.neoOut}
                >
                  <h3 className="font-bold text-neo-dark mb-2">{pred.date}</h3>
                  <div className="text-sm text-neo-mid mb-3">
                    <div>Demanda estimada: {pred.predicted_units} órdenes</div>
                    <div>Confianza: {Math.round(pred.confidence * 100)}%</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
