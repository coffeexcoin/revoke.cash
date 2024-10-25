import { ERC721_ABI } from 'lib/abis';
import { ApprovalEvent } from 'lib/interfaces';
import { addressToTopic } from 'lib/utils';
import { generatePatchedAllowanceEvents } from 'lib/utils/allowances';
import { parseApprovalLog } from 'lib/utils/events';
import { useMemo } from 'react';
import { Address, getAbiItem, toEventSelector } from 'viem';
import { useLogsFullBlockRange } from '../useLogsFullBlockRange';
import { useOpenSeaProxyAddress } from '../useOpenSeaProxyAddress';
import { usePermit2Events } from './usePermit2Events';

export const useEvents = (
  address: Address,
  chainId: number,
): {
  events: {
    transferFrom: ApprovalEvent[];
    transferTo: ApprovalEvent[];
    approval: ApprovalEvent[];
    approvalForAll: ApprovalEvent[];
    permit2Approval: ApprovalEvent[];
  };
  isLoading: boolean;
  error?: Error;
} => {
  const { openSeaProxyAddress, isLoading: isOpenSeaProxyAddressLoading } = useOpenSeaProxyAddress(address);

  const getErc721EventSelector = (eventName: 'Transfer' | 'Approval' | 'ApprovalForAll') => {
    return toEventSelector(getAbiItem({ abi: ERC721_ABI, name: eventName }));
  };

  const addressTopic = address ? addressToTopic(address) : undefined;
  const transferToTopics = addressTopic && [getErc721EventSelector('Transfer'), null, addressTopic];
  const transferFromTopics = addressTopic && [getErc721EventSelector('Transfer'), addressTopic];
  const approvalTopics = addressTopic && [getErc721EventSelector('Approval'), addressTopic];
  const approvalForAllTopics = addressTopic && [getErc721EventSelector('ApprovalForAll'), addressTopic];

  const {
    data: transferToLogs,
    isLoading: isTransferToLoading,
    error: transferToError,
  } = useLogsFullBlockRange('Transfer (to)', chainId, { topics: transferToTopics });

  const {
    data: transferFromLogs,
    isLoading: isTransferFromLoading,
    error: transferFromError,
  } = useLogsFullBlockRange('Transfer (from)', chainId, { topics: transferFromTopics });

  const {
    data: approvalLogs,
    isLoading: isApprovalLoading,
    error: approvalError,
  } = useLogsFullBlockRange('Approval', chainId, { topics: approvalTopics });

  const {
    data: approvalForAllUnpatchedLogs,
    isLoading: isApprovalForAllLoading,
    error: approvalForAllError,
  } = useLogsFullBlockRange('ApprovalForAll', chainId, { topics: approvalForAllTopics });

  const {
    events: permit2ApprovalLogs,
    isLoading: isPermit2ApprovalLoading,
    error: permit2ApprovalError,
  } = usePermit2Events(address, chainId);

  // Manually patch the ApprovalForAll events
  const approvalForAllLogs = useMemo(() => {
    if (!transferFromLogs || !transferToLogs || !approvalLogs || !approvalForAllUnpatchedLogs) return undefined;
    return [
      ...approvalForAllUnpatchedLogs,
      ...generatePatchedAllowanceEvents(address, openSeaProxyAddress, [
        ...approvalLogs,
        ...approvalForAllUnpatchedLogs,
        ...transferFromLogs,
        ...transferToLogs,
      ]),
    ];
  }, [transferFromLogs, transferToLogs, approvalLogs, approvalForAllUnpatchedLogs, openSeaProxyAddress]);

  const approval = approvalLogs.map((log) => parseApprovalLog(log, chainId));
  const approvalForAll = approvalForAllLogs.map((log) => parseApprovalLog(log, chainId));
  const permit2Approval = permit2ApprovalLogs.map((log) => parseApprovalLog(log, chainId));
  const transferFrom = transferFromLogs.map((log) => parseApprovalLog(log, chainId));
  const transferTo = transferToLogs.map((log) => parseApprovalLog(log, chainId));

  const isEventsLoading = isTransferFromLoading || isTransferToLoading || isApprovalLoading || isApprovalForAllLoading;
  const isLoading = isOpenSeaProxyAddressLoading || isEventsLoading || isPermit2ApprovalLoading;
  const eventsError = transferFromError || transferToError || approvalError || approvalForAllError;
  const error = eventsError || permit2ApprovalError;

  const events = useMemo(() => {
    if (!transferFrom || !transferTo || !approval || !approvalForAll || !permit2Approval) return undefined;
    if (error || isLoading) return undefined;
    return { transferFrom, transferTo, approval, approvalForAll, permit2Approval };
  }, [transferFrom, transferTo, approval, approvalForAll, permit2Approval]);

  return { events, isLoading, error };
};
