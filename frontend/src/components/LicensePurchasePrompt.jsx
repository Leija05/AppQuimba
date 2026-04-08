import React from 'react';
import { Lock, ShoppingCart, ExternalLink } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const LicensePurchasePrompt = ({
  title = "Licencia Requerida",
  message = "No tienes una licencia activa. Adquiere una licencia para acceder a todas las funciones.",
  purchaseUrl = "https://leija05.github.io/Venta/",
  showIcon = true,
  variant = "card" // "card" | "inline" | "banner"
}) => {

  const handlePurchaseClick = () => {
    window.open(purchaseUrl, '_blank', 'noopener,noreferrer');
  };

  if (variant === "banner") {
    return (
      <div className="notice-overlay">
        <div className="notice-content bg-white border-2 border-[#002FA7] rounded-sm shadow-lg p-6 max-w-md mx-auto">
          <div className="flex items-start gap-4">
            {showIcon && (
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <Lock size={24} weight="duotone" className="text-red-600" />
                </div>
              </div>
            )}
            <div className="flex-1 space-y-3">
              <h3 className="text-lg font-bold text-slate-900">{title}</h3>
              <p className="text-sm text-slate-600">{message}</p>
              <Button
                onClick={handlePurchaseClick}
                className="w-full bg-[#002FA7] hover:bg-[#002277] text-white font-semibold"
              >
                <ShoppingCart size={18} className="mr-2" />
                Adquirir Licencia
                <ExternalLink size={16} className="ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-sm">
        <div className="flex items-center gap-3">
          {showIcon && <Lock size={20} weight="duotone" className="text-amber-600" />}
          <span className="text-sm font-medium text-amber-900">{message}</span>
        </div>
        <Button
          onClick={handlePurchaseClick}
          size="sm"
          className="bg-[#002FA7] hover:bg-[#002277] text-white"
        >
          <ShoppingCart size={16} className="mr-1" />
          Comprar
          <ExternalLink size={14} className="ml-1" />
        </Button>
      </div>
    );
  }

  return (
    <Card className="border-2 border-[#002FA7]">
      <CardHeader>
        <div className="flex items-center gap-3">
          {showIcon && (
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <Lock size={20} weight="duotone" className="text-red-600" />
            </div>
          )}
          <CardTitle className="text-slate-900">{title}</CardTitle>
        </div>
        <CardDescription className="text-slate-600">
          {message}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          onClick={handlePurchaseClick}
          className="w-full bg-[#002FA7] hover:bg-[#002277] text-white font-semibold"
        >
          <ShoppingCart size={18} className="mr-2" />
          Adquirir Licencia Ahora
          <ExternalLink size={16} className="ml-2" />
        </Button>
        <p className="text-xs text-slate-500 text-center mt-3">
          Se abrirá en una nueva pestaña
        </p>
      </CardContent>
    </Card>
  );
};

export default LicensePurchasePrompt;
