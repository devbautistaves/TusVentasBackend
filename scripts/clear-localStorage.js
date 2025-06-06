// Script para limpiar localStorage y datos corruptos
console.log("🧹 Limpiando localStorage y datos corruptos...")

// Limpiar localStorage
if (typeof localStorage !== "undefined") {
  localStorage.clear()
  console.log("✅ localStorage limpiado")
} else {
  console.log("ℹ️ localStorage no disponible en este entorno")
}

// Limpiar sessionStorage también por si acaso
if (typeof sessionStorage !== "undefined") {
  sessionStorage.clear()
  console.log("✅ sessionStorage limpiado")
}

console.log("🎯 Para limpiar completamente:")
console.log("1. Ejecuta este script")
console.log("2. Cierra y abre el navegador")
console.log("3. Ve a DevTools > Application > Storage > Clear storage")
console.log("4. Reinicia el servidor frontend y backend")
