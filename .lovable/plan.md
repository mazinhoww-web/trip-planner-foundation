

## ✅ Plano concluído: Adaptar OCR para limites do plano Free do OCR.space

### O que foi feito

1. **Validação de tamanho no edge function**: Arquivos > 1 MB pulam OCR.space e vão direto para fallbacks
2. **Resize de imagem no client**: Imagens > 900 KB são redimensionadas via canvas antes do envio
3. **Lovable AI como fallback**: Substituído OpenRouter/Gemma por Gemini Flash via Lovable AI gateway
4. **Logging detalhado**: Tamanho do arquivo e warnings incluídos nas respostas
