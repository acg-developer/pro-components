﻿import { compareVersions, useRefFunction } from '@ant-design/pro-utils';
import type { DrawerProps, FormProps } from 'antd';
import { ConfigProvider, version, Drawer } from 'antd';
import merge from 'lodash.merge';
import useMergedState from 'rc-util/lib/hooks/useMergedState';
import { noteOnce } from 'rc-util/lib/warning';
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CommonFormProps, ProFormInstance } from '../../BaseForm';
import { BaseForm } from '../../BaseForm';

export type DrawerFormProps<T = Record<string, any>> = Omit<FormProps, 'onFinish' | 'title'> &
  CommonFormProps<T> & {
    /**
     * 接收任意值，返回 真值 会关掉这个抽屉
     *
     * @name 表单结束后调用
     *
     * @example 结束后关闭抽屉
     * onFinish: async ()=> {await save(); return true}
     *
     * @example 结束后不关闭抽屉
     * onFinish: async ()=> {await save(); return false}
     */
    onFinish?: (formData: T) => Promise<any>;

    /** @name 提交数据时，禁用取消按钮的超时时间（毫秒）。 */
    submitTimeout?: number;

    /** @name 用于触发抽屉打开的 dom ，只能设置一个*/
    trigger?: JSX.Element;

    /**
     * @deprecated use onOpenChange replace
     */
    onVisibleChange?: (visible: boolean) => void;
    /**
     * @deprecated use open replace
     */
    visible?: boolean;

    /** @name 受控的打开关闭 */
    open?: DrawerProps['open'];

    /**
     * @name 打开关闭的事件 */
    onOpenChange?: (visible: boolean) => void;
    /**
     * 不支持 'visible'，请使用全局的 visible
     *
     * @name 抽屉的配置
     */
    drawerProps?: Omit<DrawerProps, 'visible'>;

    /** @name 抽屉的标题 */
    title?: DrawerProps['title'];

    /** @name 抽屉的宽度 */
    width?: DrawerProps['width'];
  };

function DrawerForm<T = Record<string, any>>({
  children,
  trigger,
  onVisibleChange,
  drawerProps,
  onFinish,
  submitTimeout,
  title,
  width,
  onOpenChange,
  visible: propVisible,
  open: propsOpen,
  ...rest
}: DrawerFormProps<T>) {
  noteOnce(
    // eslint-disable-next-line @typescript-eslint/dot-notation
    !rest['footer'] || !drawerProps?.footer,
    'DrawerForm 是一个 ProForm 的特殊布局，如果想自定义按钮，请使用 submit.render 自定义。',
  );
  const context = useContext(ConfigProvider.ConfigContext);

  const [, forceUpdate] = useState([]);
  const [loading, setLoading] = useState(false);

  const [open, setOpen] = useMergedState<boolean>(!!propVisible, {
    value: propsOpen || propVisible,
    onChange: onOpenChange || onVisibleChange,
  });

  const footerRef = useRef<HTMLDivElement | null>(null);

  const footerDomRef: React.RefCallback<HTMLDivElement> = useCallback((element) => {
    if (footerRef.current === null && element) {
      forceUpdate([]);
    }
    footerRef.current = element;
  }, []);

  const formRef = useRef<ProFormInstance>();

  const resetFields = useCallback(() => {
    const form = rest.formRef?.current ?? rest.form ?? formRef.current;
    // 重置表单
    if (form && drawerProps?.destroyOnClose) {
      form.resetFields();
    }
  }, [drawerProps?.destroyOnClose, rest.form, rest.formRef]);

  useEffect(() => {
    if (open && (propsOpen || propVisible)) {
      onOpenChange?.(true);
      onVisibleChange?.(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propVisible, open]);

  const triggerDom = useMemo(() => {
    if (!trigger) {
      return null;
    }

    return React.cloneElement(trigger, {
      key: 'trigger',
      ...trigger.props,
      onClick: async (e: any) => {
        setOpen(!open);
        trigger.props?.onClick?.(e);
      },
    });
  }, [setOpen, trigger, open]);

  const submitterConfig = useMemo(() => {
    if (rest.submitter === false) {
      return false;
    }

    return merge(
      {
        searchConfig: {
          submitText: context.locale?.Modal?.okText ?? '确认',
          resetText: context.locale?.Modal?.cancelText ?? '取消',
        },
        resetButtonProps: {
          preventDefault: true,
          // 提交表单loading时，不可关闭弹框
          disabled: submitTimeout ? loading : undefined,
          onClick: (e: any) => {
            setOpen(false);
            resetFields();
            drawerProps?.onClose?.(e);
          },
        },
      },
      rest.submitter,
    );
  }, [
    rest.submitter,
    context.locale?.Modal?.okText,
    context.locale?.Modal?.cancelText,
    submitTimeout,
    loading,
    setOpen,
    resetFields,
    drawerProps,
  ]);

  const contentRender = useCallback((formDom: any, submitter: any) => {
    return (
      <>
        {formDom}
        {footerRef.current && submitter ? createPortal(submitter, footerRef.current) : submitter}
      </>
    );
  }, []);

  const onFinishHandle = useRefFunction(async (values: T) => {
    const response = onFinish?.(values);
    if (submitTimeout && response instanceof Promise) {
      setLoading(true);
      const timer = setTimeout(() => setLoading(false), submitTimeout);
      response.finally(() => {
        clearTimeout(timer);
        setLoading(false);
      });
    }
    const result = await response;
    // 返回真值，关闭弹框
    if (result) {
      setOpen(false);
    }
    return result;
  });

  const drawerOpenProps =
    compareVersions(version, '4.23.0') > -1
      ? {
          open: open,
          onOpenChange: onVisibleChange,
          afterOpenChange: (e: boolean) => {
            if (!e) resetFields();
            drawerProps?.afterOpenChange?.(e);
          },
        }
      : {
          visible: open,
          onVisibleChange: onVisibleChange,
          afterVisibleChange: (e: boolean) => {
            if (!e) resetFields();
            drawerProps?.afterOpenChange?.(e);
          },
        };

  return (
    <>
      <Drawer
        title={title}
        width={width || 800}
        {...drawerProps}
        {...drawerOpenProps}
        onClose={(e) => {
          // 提交表单loading时，阻止弹框关闭
          if (submitTimeout && loading) return;
          setOpen(false);
          drawerProps?.onClose?.(e);
          resetFields();
        }}
        footer={
          rest.submitter !== false && (
            <div
              ref={footerDomRef}
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            />
          )
        }
      >
        <>
          <BaseForm
            formComponentType="DrawerForm"
            layout="vertical"
            formRef={formRef}
            {...rest}
            submitter={submitterConfig}
            onFinish={async (values) => {
              const result = await onFinishHandle(values);
              if (result === true) {
                resetFields();
              }
              return result;
            }}
            contentRender={contentRender}
          >
            {children}
          </BaseForm>
        </>
      </Drawer>
      {triggerDom}
    </>
  );
}

export { DrawerForm };
