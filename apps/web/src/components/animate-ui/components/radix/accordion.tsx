import * as React from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const Accordion = AccordionPrimitive.Root;

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item ref={ref} className={className} {...props} />
));
AccordionItem.displayName = 'AccordionItem';

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger> & { showArrow?: boolean }
>(({ className, children, showArrow = true, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex w-full">
    <AccordionPrimitive.Trigger ref={ref} className={className} {...props}>
      {children}
      {showArrow && (
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
      )}
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName;

const MotionWrapper = React.forwardRef<HTMLDivElement, any>(
  ({ 'data-state': state, className, children, keepRendered, hidden, ...props }, ref) => {
    const isOpen = state === 'open';

    return (
      <motion.div
        ref={ref}
        initial={false}
        animate={isOpen ? 'open' : 'closed'}
        variants={{
          open: { height: 'auto', opacity: 1, display: 'block' },
          closed: { height: 0, opacity: 0, transitionEnd: keepRendered ? {} : { display: 'none' } },
        }}
        transition={{ type: 'spring', stiffness: 150, damping: 22 }}
        className={cn("overflow-hidden", className)}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);
MotionWrapper.displayName = 'MotionWrapper';

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content> & { keepRendered?: boolean }
>(({ className, children, keepRendered, ...props }, ref) => (
  <AccordionPrimitive.Content ref={ref} forceMount asChild {...props}>
    <MotionWrapper className={className} keepRendered={keepRendered}>
      {children}
    </MotionWrapper>
  </AccordionPrimitive.Content>
));
AccordionContent.displayName = AccordionPrimitive.Content.displayName;

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
